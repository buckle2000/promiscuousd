const assert = require('assert')
const Joi = require('joi');

const C = {
    API_VERSION: "1"
}

const schema = Joi.object().keys({
    promiscuousd: Joi.object().keys({
        version:   Joi.string().equal(C.API_VERSION).required(),
        name:      Joi.string().min(1).required(),
        port:      Joi.number().port().required(),
        createdAt: Joi.date().iso().required(),
    }).required()
}).required()

function is_ads_valid(ads) {
    const result = Joi.validate(ads, schema);
    return result.error === null
}

function make_advertisement(name, port) {
    const ads = {
        promiscuousd: {
            version: C.API_VERSION,
            name,
            port,
            createdAt: new Date().toISOString()
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
        ...node.advertisement.promiscuousd // version name port createdAt
    }
}

module.exports = {
    C,
    is_ads_valid,
    make_advertisement,
    new_discover_node,
    describe_service,
}