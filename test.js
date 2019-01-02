const Discover = require('@dashersw/node-discover')

// var d = new Discover();
var d = new Discover({ key : process.argv[2], port: 12345 });

d.advertise({
	http : "80",
	random : Math.random()
});

d.on("added", function (node) {
	console.log("Add");
	console.log(node);
});

d.on("removed", function (node) {
	console.log("Remove");
	console.log(node);
});

d.on("error", function (err) {
	console.log("Error", err);
});


// const {is_ads_valid} = require('./utils')

// console.log(is_ads_valid({
// 	promiscuousd: {
// 		version: '1',
// 		name: 'd',
// 		port: -1,
// 	}
// }))