const assert = require('assert')
const Joi = require('joi');

const API_VERSION = "1"

const schema = Joi.object().keys({
    promiscuousd: Joi.object().keys({
        version:    Joi.string().equal(API_VERSION).required(),
        name:       Joi.string().min(1).required(),
        port:       Joi.number().port().required(),
        created_at: Joi.date().iso().required(),
        is_pty:     Joi.boolean(),
    }).required()
}).required()

function is_ads_valid(ads) {
    const result = Joi.validate(ads, schema);
    return result.error === null
}

function make_advertisement(name, port, is_pty) {
    const ads = {
        promiscuousd: {
            version: API_VERSION,
            name,
            port,
            is_pty,
            created_at: new Date().toISOString()
        }
    }
    const result = Joi.validate(ads, schema)
    if (result.error) throw error
    return ads
}

const Discover = require('@dashersw/node-discover')

function new_discover_node() {
    return new Discover()
}

function describe_service(node) {
    return {
        address: node.address,
        ...node.advertisement.promiscuousd // version name port created_at
    }
}

module.exports = {
    is_ads_valid,
    make_advertisement,
    new_discover_node,
    describe_service,
}