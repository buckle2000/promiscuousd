const {
    is_ads_valid,
    new_discover_node,
    describe_service
} = require('./utils')

const d = new_discover_node()
const debug_d = require('debug')('pmc:discover')
debug_d.enabled = true

d.on('added', node => {
    if (is_ads_valid(node.advertisement)) {
        const desc = describe_service(node)
        debug_d('%o up %s:%d', desc.name, desc.address, desc.port)
    }
})

d.on('removed', node => {
    if (is_ads_valid(node.advertisement)) {
        const desc = describe_service(node)
        debug_d('%o down %s:%d', desc.name, desc.address, desc.port)
    }
})

d.on('error', err => {
    throw err
    debug_d('Error: %O', err)
})