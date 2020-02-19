/*
 * Copyright (C) 2018, 2020 Oracle and/or its affiliates. All rights reserved.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl
 *
 * Please see LICENSE.txt file included in the top-level directory of the
 * appropriate download for a copy of the license and additional information.
 */

'use strict';

const Enum = require('./constants').Enum;

const Realms = {
    OC1: {
        realmId: 'oc1',
        secondLevelDomain: 'oraclecloud.com'
    },
    OC2: {
        realmId: 'oc2',
        secondLevelDomain: 'oraclegovcloud.com'
    },
    OC3: {
        realmId: 'oc3',
        secondLevelDomain: 'oraclegovcloud.com'
    },
    OC4: {
        realmId: 'oc3',
        secondLevelDomain: 'oraclegovcloud.uk'
    }
};

/**
 * Cloud service only.
 * <p>
 * This enumeration lists all regions available for Oracle NoSQL Database
 * Cloud Service.
 * [This page]{@link https://docs.cloud.oracle.com/iaas/Content/General/Concepts/regions.htm}
 * provides information about Oracle Cloud Infrastracture regions,
 * availability domains and realms.
 * <p>
 * You may use {@link Region} to provide the service endpoint by specifying
 * {@link Config}#region instead of {@link Config}#endpoint. The endpoint will
 * be inferred from the region. Use of a {@link Region} instance is preferred
 * to an endpoint.
 * <p>
 * The string-based endpoints associated with regions for the Oracle NoSQL
 * Database Cloud Service are of the format
 * <pre>    https://nosql.{region}.oci.{secondLevelDomain} </pre>
 * Examples of known second level domains include:
 * <ul>
 * <li>oraclecloud.com</li>
 * <li>oraclegovcloud.com</li>
 * <li>oraclegovcloud.uk</li>
 * </ul>
 * For example, this is a valid endpoint for the Oracle NoSQL Database Cloud
 * Service in the U.S. East region
 * <pre>    nosql.us-ashburn-1.oci.oraclecloud.com </pre>
 * If the Oracle NoSQL Database Cloud Service becomes available in a region
 * not listed here it is possible to connect to that region by setting
 * {@link Config}#endpoint to the endpoint string.
 *
 * @extends Enum
 * @hideconstructor
 *
 * @see {@link Config}
 */
class Region extends Enum {
    constructor(regionId, realm) {
        super();
        this._regionId = regionId;
        this._realm = realm;
    }

    //currently only called by Config._init()
    static _fromRegionId(regionId) {
        return Region[regionId.replace(/-/g, '_').toUpperCase()];
    }

    get regionId() {
        return this._regionId;
    }

    get secondLevelDomain() {
        return this._realm.secondLevelDomain;
    }

    /**
     * NoSQL service endpoint for this region.
     * @type {string}
     * @readonly
     */
    get endpoint() {
        return `https://nosql.${this._regionId}.oci.${this._realm.secondLevelDomain}`;
    }
}

/**
 * Realm: OC1, South Korea Central (Seoul)
 */
Region.AP_SEOUL_1 = new Region('ap-seoul-1', Realms.OC1);

/**
 * Realm: OC1, Japan East (Tokyo)
 */
Region.AP_TOKYO_1 = new Region('ap-tokyo-1', Realms.OC1);

/**
 * Realm: OC1, India West (Mumbai)
 */
Region.AP_MUMBAI_1 = new Region('ap-mumbai-1', Realms.OC1);

/**
 * Realm: OC1, Australia East (Sydney)
 */
Region.AP_SYDNEY_1 = new Region('ap-sydney-1', Realms.OC1);

/**
 * Realm: OC1, UK South (London)
 */
Region.UK_LONDON_1 = new Region('uk-london-1', Realms.OC1);

/**
 * Realm: OC1, Germany Central (Frankfurt)
 */
Region.EU_FRANKFURT_1 = new Region('eu-frankfurt-1', Realms.OC1);

/**
 * Realm: OC1, Switzerland North (Zurich)
 */
Region.EU_ZURICH_1 = new Region('eu-zurich-1', Realms.OC1);

/**
 * Realm: OC1, US East (Ashburn)
 */
Region.US_ASHBURN_1 = new Region('us-ashburn-1', Realms.OC1);

/**
 * Realm: OC1, US West (Phoenix)
 */
Region.US_PHOENIX_1 = new Region('us-phoenix-1', Realms.OC1);

/**
 * Realm: OC1, Canada Southeast (Toronto)
 */
Region.CA_TORONTO_1 = new Region('ca-toronto-1', Realms.OC1);

/**
 * Realm: OC1, Brazil East (Sao Paulo)
 */
Region.SA_SAOPAULO_1 = new Region('sa-saopaulo-1', Realms.OC1);

/**
 * Realm: OC2, US Gov East (Ashburn)
 */
Region.US_LANGLEY_1 = new Region('us-langley-1', Realms.OC2);

/**
 * Realm: OC2, US Gov West (Phoenix)
 */
Region.US_LUKE_1 = new Region('us-luke-1', Realms.OC2);

/**
 * Realm: OC3, US DoD East (Ashburn)
 */
Region.US_GOV_ASHBURN_1 = new Region('us-gov-ashburn-1', Realms.OC3);

/**
 * Realm: OC3, US DoD North (Chicago)
 */
Region.US_GOV_CHICAGO_1 = new Region('us-gov-chicago-1', Realms.OC3);

/**
 * Realm: OC3, US DoD West (Phoenix)
 */
Region.US_GOV_PHOENIX_1 = new Region('us-gov-phoenix-1', Realms.OC3);

/**
 * Realm: OC4, UK Gov South (London)
 */
Region.UK_GOV_LONDON_1 = new Region('uk-gov-london-1', Realms.OC4);

Region.seal();

module.exports = Region;