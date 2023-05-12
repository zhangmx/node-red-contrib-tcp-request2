var should = require("should");
var helper = require("node-red-node-test-helper");
helper.init(require.resolve('node-red'));

var functionNode = require("../tcp-request2.js");

describe('tcp request2 node', function() {

    before(function(done) {
        helper.startServer(done);
    });

    after(function(done) {
        helper.stopServer(done);
    }); 

    afterEach(function() {
        helper.unload();
    });

    it('should be loaded', function(done) {
        var flow = [{id:"n1", type:"tcp request2", name: "tcp request2" }];
        helper.load(functionNode, flow, function() {
            var n1 = helper.getNode("n1");
            n1.should.have.property('name', 'tcp request2');
            done();
        });
    });
});