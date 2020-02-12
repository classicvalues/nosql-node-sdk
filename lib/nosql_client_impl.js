/*
 * Copyright (C) 2018, 2020 Oracle and/or its affiliates. All rights reserved.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl
 *
 * Please see LICENSE.txt file included in the top-level directory of the
 * appropriate download for a copy of the license and additional information.
 */

'use strict';

const EventEmitter = require('events');
const assert = require('assert');
const HttpClient = require('./http_client');

const ops = require('./ops');

const TableState = require('./constants').TableState;
const AdminState = require('./constants').AdminState;
const ServiceType = require('./constants').ServiceType;
const ErrorCode = require('./error').ErrorCode;
const NoSQLTimeoutError = require('./error').NoSQLTimeoutError;
const NoSQLProtocolError = require('./error').NoSQLProtocolError;
const NoSQLArgumentError = require('./error').NoSQLArgumentError;
const Config = require('./config');
const promisified = require('./utils').promisified;
const sleep = require('./utils').sleep;
const PreparedStatement = require('./stmt').PreparedStatement;
const QueryPlanExecutor = require('./query/common').QueryPlanExecutor;

class NoSQLClientImpl extends EventEmitter {

    constructor(config) {
        super();
        this._config = Config.create(config);
        this._client = new HttpClient(this._config);
        //Forward all events to the _client.
        this.on('newListener', (event, listener) => {
            this._client.on(event, listener);
        });
        this.on('removeListener', (event, listener) => {
            this._client.removeListener(event, listener);
        });
        //To prevent throwing if no error events are registered.
        //We should log the error in this listener.
        this.on('error', () => {});
    }

    _assignOpt(opt, addOpt) {
        if (opt == null) {
            return addOpt;
        }
        //We don't throw here because we want the error to be handled
        //asynchronously.  If a user passes invalid opt which is not
        //an object, we just return it and pass it to asynchronous code
        //for validation.
        if (typeof opt !== 'object') {
            return opt;
        }
        return Object.assign({}, opt, addOpt);
    }

    //Callback versions of APIs that will be promisified

    _waitForTableState(table, tableState, opt, callback) {
        const req = {
            api: typeof table === 'string' ? this.forTableState :
                this.forCompletion,
            table,
            tableState,
            opt
        };
        try {
            ops.PollTableOp.applyDefaults(req, this._config);
            ops.PollTableOp.validate(req);
        } catch(err) {
            return process.nextTick(callback, err);
        }

        //Request for GetTableOp
        const gtReq = {
            api: req.api,
            table,
            opt
        };

        const startTime = Date.now();
        const cb = (err, res) => {
            if (err) {
                if (err.errorCode === ErrorCode.TABLE_NOT_FOUND &&
                    req.tableState === TableState.DROPPED) {
                    this.emit('tableState', req.tableName,
                        TableState.DROPPED);
                    return callback(null, {
                        tableName: gtReq.tableName,
                        tableState: TableState.DROPPED
                    });
                }
                return callback(err);
            }
            if (res.tableState === req.tableState) {
                return callback(null, res);
            }
            if (Date.now() - startTime > req.opt.timeout) {
                return callback(new NoSQLTimeoutError(
                    req.opt.tablePollTimeout, null, req));
            }
            setTimeout(() => this._client.execute(ops.GetTableOp, gtReq, cb),
                req.opt.delay);
        };
        this._client.execute(ops.GetTableOp, gtReq, cb);
    }

    _getIndex(tableName, indexName, opt, callback) {
        const req = {
            api: this.getIndex,
            tableName,
            opt
        };
        req.opt = this._assignOpt(opt, { indexName });
        return this._client.execute(ops.GetIndexesOp, req,
            (err, res) => {
                if (err) {
                    return callback(err);
                }
                if (res.length != 1) {
                    return callback(new NoSQLProtocolError(
                        `Unexpected number of index results: ${res.length}`,
                        null, req));
                }
                callback(null, res[0]);
            });
    }

    //Note: This function is only used if opt.all is set to true and is not
    //fully implemented yet to account for throttling errors.  Reserved for
    //future use.
    _deleteRangeAll(tableName, key, opt, callback) {
        const req = {
            api: this.deleteRange,
            tableName,
            key,
            opt
        };
        //Accumulate deletedCount and consumedCapacity
        const total = {
            deletedCount: 0,
            consumedCapacity: 
                this._config.serviceType !== ServiceType.KVSTORE ? {
                    readKB: 0,
                    readUnits: 0,
                    writeKB: 0,
                    writeUnits: 0
                } : null
        };
        const cb = (err, res) => {
            if (err) {
                return callback(err);
            }
            assert(res.deletedCount != null);
            assert(res.consumedCapacity != null ||
                total.consumedCapacity == null);
            total.deletedCount += res.deletedCount;
            if (total.consumedCapacity) {
                for(let key in total.consumedCapacity) {
                    total.consumedCapacity[key] += res.consumedCapacity[key];
                }
            }
            if (!res.continuationKey) {
                res.deletedCount = total.deletedCount;
                if (total.consumedCapacity) {
                    Object.assign(res.consumedCapacity,
                        total.consumedCapacity);
                }
                return callback(err, res);
            }
            opt.continuationKey = res.continuationKey;
            return this._client.execute(ops.MultiDeleteOp, req, cb);
        };
        return this._client.execute(ops.MultiDeleteOp, req, cb);
    }

    _prepare(stmt, opt, callback) {
        return this._client.execute(ops.PrepareOp, {
            api: this.prepare,
            stmt,
            opt
        },
        (err, res) => {
            if (err) {
                return callback(err);
            }
            res.__proto__ = new PreparedStatement();
            return callback(null, res);
        });
    }

    _query(stmt, opt, callback) {
        const req = {
            api: this.query,
            opt
        };
        const ck = opt ? opt.continuationKey : null;
        if (ck && ck._prepStmt) {
            req.prepStmt = ck._prepStmt;
        } else if (typeof stmt !== 'string') {
            req.prepStmt = stmt;
        } else {
            req.stmt = stmt;
        }
        if (req.prepStmt && req.prepStmt._queryPlan) { //advanced query
            let qpExec = ck ? ck._qpExec : null;
            if (!qpExec) {
                //first advanced query call, created plan executor
                qpExec = new QueryPlanExecutor(this, req.prepStmt);
            }
            return qpExec.execute(req, callback);
        }
        //If we are here, this is either simple query (no query plan) or
        //advanced query that has not yet been prepared.  In the latter case,
        //this first invocation of query() will return result with prepared
        //query plan and no records, the query will be executed on the
        //subsequent invocations of query() method.
        return this._client.execute(ops.QueryOp, req, callback);
    }

    _execute(op, req) {
        return promisified(this._client, this._client.execute,
            op, req);
    }

    async _adminStatus(req) {
        if (req.adminResult != null && req.adminResult.operationId == null) {
            //still validate options passed for correctness
            ops.AdminStatusOp.applyDefaults(req, this._config);
            ops.AdminStatusOp.validate(req);
            return req.adminResult;
        }
        return this._execute(ops.AdminStatusOp, req);
    }

    async _forAdminCompletion(adminResult, opt) {
        const req = {
            api: this.adminStatus,
            adminResult,
            opt
        };

        //initialize and apply defaults to req.opt such as timeout and delay
        ops.AdminPollOp.applyDefaults(req, this._config);
        ops.AdminPollOp.validate(req);

        if (adminResult.state === AdminState.COMPLETE) {
            return adminResult;
        }

        const startTime = Date.now();
        for(;;) {
            const res = await this._adminStatus(req);
            if (res.state === AdminState.COMPLETE) {
                return res;
            }
            if (Date.now() - startTime > req.opt.timeout) {
                throw new NoSQLTimeoutError(req.opt.timeout, null, req);
            }
            await sleep(req.opt.delay);
        }

    }

    _forTableState(table, tableState, opt) {
        return promisified(this, this._waitForTableState, table,
            tableState, opt);
    }

    async _forCompletion(res, opt) {
        let ret;
        if (res == null) {
            throw new NoSQLArgumentError(
                'forCompletion: missing result object');
        }
        if (res._forAdmin) {
            ret = await this._forAdminCompletion(res, opt);
        } else {
            const isDropTable = typeof res._stmt === 'string' &&
                res._stmt.match(/^\s*DROP\s+TABLE/i);
            ret = await this._forTableState(res, isDropTable ?
                TableState.DROPPED : TableState.ACTIVE, opt);
        }
        return Object.assign(res, ret);
    }

    async _withCompletion(op, req) {
        const startTime = Date.now();
        const res = await this._execute(op, req);
        //should be already set by _execute above
        assert(req.opt.hasOwnProperty('timeout'));
        const timeOut = req.opt.timeout - (Date.now() - startTime);
        req.opt.timeout = Math.max(timeOut, 1);
        return this._forCompletion(res, req.opt);
    }

    async _adminListOp(opName, stmt, req) {
        if (req.opt == null) {
            req.opt = { complete: true };
        } else if (typeof req.opt === 'object') {
            //if typeof opt !== 'object', it will be passed to adminDDL
            //and throw during validation
            req.opt = Object.assign({ complete: true }, req.opt);
        }
        let res = await this.adminDDL(stmt, req.opt);
        if (res.output == null) {
            throw new NoSQLProtocolError(`Missing output for ${opName}`, null,
                req);
        }
        try {
            res = JSON.parse(res.output);
        } catch(err) {
            throw new NoSQLProtocolError(`Error parsing output for \
${opName}`, null, req);
        }
        if (res == null || typeof res !== 'object') {
            throw new NoSQLProtocolError(`Invalid output for ${opName}`, null,
                req);
        }
        return res;
    }

    async _listNamespaces(opt) {
        const req = { //will be included in any thrown errors
            api: this.listNamespaces,
            opt
        };
        const res = await this._adminListOp('listNamespaces',
            'SHOW AS JSON NAMESPACES', req);
        if (res.namespaces == null) {
            return [];
        }
        if (!Array.isArray(res.namespaces) || res.namespaces.findIndex(
            el => typeof el !== 'string') !== -1) {
            throw new NoSQLProtocolError('Invalid namespaces array in \
the output for listNamespaces operation', null, req);
        }
        return res.namespaces;
    }

    async _listUsers(opt) {
        const req = { //will be included in any thrown errors
            api: this.listUsers,
            opt
        };
        const res = await this._adminListOp('listUsers', 'SHOW AS JSON USERS',
            req);
        if (res.users == null) {
            return [];
        }
        if (!Array.isArray(res.users)) {
            throw new NoSQLProtocolError('Invalid users array in the output \
for listUsers operation', null, req);
        }
        return res.users.map(user => {
            if (user == null || typeof user !== 'object' ||
            typeof user.id !== 'string' || typeof user.name !== 'string') {
                throw new NoSQLProtocolError('Invalid value in the users \
array in the output for listUsers operation', null, req);
            }
            return {
                id: user.id,
                name: user.name
            };
        });
    }

    async _listRoles(opt) {
        const req = { //will be included in any thrown errors
            api: this.listRoles,
            opt
        };
        const res = await this._adminListOp('listRoles', 'SHOW AS JSON ROLES',
            req);
        if (res.roles == null) {
            return [];
        }
        if (!Array.isArray(res.roles)) {
            throw new NoSQLProtocolError('Invalid roles array in the output \
for listRoles operation', null, req);
        }
        return res.roles.map(role => {
            if (role == null || typeof role !== 'object' ||
            typeof role.name !== 'string') {
                throw new NoSQLProtocolError('Invalid value in the roles \
array in the output for listRoles operation', null, req);
            }
            return role.name;
        });
    }

    close() {
        this._client.shutdown();
        return Promise.resolve(Config.destroy(this._config));
    }
    
}

module.exports = NoSQLClientImpl;