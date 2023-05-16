/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
    "use strict";
    // socketTimeout replace with node.overTime
    // let socketTimeout = RED.settings.socketTimeout || null;
    // console.log("socketTimeout: " + socketTimeout);

    const msgQueueSize = RED.settings.tcpMsgQueueSize || 1000;
    const Denque = require('denque');
    const net = require('net');
    const tls = require('tls');

    function getAllowUnauthorized() {
        const allowUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';

        if (allowUnauthorized) {
            process.emitWarning(
                'Setting the NODE_TLS_REJECT_UNAUTHORIZED ' +
                'environment variable to \'0\' makes TLS connections ' +
                'and HTTPS requests insecure by disabling ' +
                'certificate verification.');
        }
        return allowUnauthorized;
    }

    /**
     * Enqueue `item` in `queue`
     * @param {Denque} queue - Queue
     * @param {*} item - Item to enqueue
     * @private
     * @returns {Denque} `queue`
     */
    const enqueue = (queue, item) => {
        // drop msgs from front of queue if size is going to be exceeded
        if (queue.length === msgQueueSize) { queue.shift(); }
        queue.push(item);
        return queue;
    };

    /**
     * Shifts item off front of queue
     * @param {Deque} queue - Queue
     * @private
     * @returns {*} Item previously at front of queue
     */
    const dequeue = queue => queue.shift();


    function TcpRequest2(n) {
        RED.nodes.createNode(this, n);
        this.server = n.server;
        this.serverType = n.serverType || "str";
        this.port = n.port;
        this.portType = n.portType || "str";
        this.out = n.out; // "time" or "char" or "count"
        this.ret = n.ret || "buffer"; // default return is a buffer object( or string )
        this.newline = (n.newline || "").replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t");
        this.trim = n.trim || false;
        this.bufferLength = Number(n.bufferLength || 65536);
        this.overTime = Number(n.overTime);
        this.maxRetries = Number(n.maxRetries) || 0;

        this.splitc = n.splitc;
        this.waitingTime = Number(n.waitingTime);
        this.waitingLength = Number(n.waitingLength);

        this.tls = n.tls;
        // if (n.tls) {
        //     var tlsNode = RED.nodes.getNode(n.tls);
        // }

        // if (this.out === "immed") { this.waitingTime = -1; this.out = "time"; }
        // if (this.out !== "char") { this.waitingLength = Number(this.waitingLength); }
        // else {
        if (this.out === "char") {
            if (this.splitc[0] == '\\') {
                this.splitc = parseInt(this.splitc.replace("\\n", 0x0A).replace("\\r", 0x0D).replace("\\t", 0x09).replace("\\e", 0x1B).replace("\\f", 0x0C).replace("\\0", 0x00));
            } // jshint ignore:line
            if (typeof this.splitc == "string") {
                if (this.splitc.substr(0, 2) == "0x") {
                    this.splitc = parseInt(this.splitc);
                }
                else {
                    this.splitc = this.splitc.charCodeAt(0);
                }
            } // jshint ignore:line
        }

        var node = this;
        var clients = {};

        this.on("input", function (msg, nodeSend, nodeDone) {
            var i = 0;
            var retries = 0;

            if ((!Buffer.isBuffer(msg.payload)) && (typeof msg.payload !== "string")) {
                msg.payload = msg.payload.toString();
            }

            var host = RED.util.evaluateNodeProperty(node.server, node.serverType, this, msg);
            var port = (RED.util.evaluateNodeProperty(node.port, node.portType, this, msg)) * 1;
            // Store client information independently
            // the clients object will have:
            // clients[id].client, clients[id].msg, clients[id].timeout
            var connection_id = host + ":" + port;
            if (connection_id !== node.last_id) {
                node.status({});
                node.last_id = connection_id;
            }

            clients[connection_id] = clients[connection_id] || {
                msgQueue: new Denque(),
                connected: false,
                connecting: false
            };

            enqueue(clients[connection_id].msgQueue, { msg: msg, nodeSend: nodeSend, nodeDone: nodeDone });
            clients[connection_id].lastMsg = msg;

            if (!clients[connection_id].connecting && !clients[connection_id].connected) {
                // node.log("connecting to " + host + ":" + port);
                var buf;
                if (node.out == "count") {
                    if (node.waitingLength === 0) { buf = Buffer.alloc(1); }
                    else { buf = Buffer.alloc(node.waitingLength); }
                }
                else { buf = Buffer.alloc(node.bufferLength); }

                var connOpts = { host: host, port: port };

                var setupTcpClient = function () {

                    if (node.tls) {

                        let tlsNode = RED.nodes.getNode(node.tls);

                        connOpts = tlsNode.addTLSOptions(connOpts);
                        const allowUnauthorized = getAllowUnauthorized();

                        let options = {
                            rejectUnauthorized: !allowUnauthorized,
                            ciphers: tls.DEFAULT_CIPHERS,
                            checkServerIdentity: tls.checkServerIdentity,
                            minDHSize: 1024,
                            ...connOpts
                        };

                        if (!options.keepAlive) { options.singleUse = true; }

                        const context = options.secureContext || tls.createSecureContext(options);

                        clients[connection_id].client = new tls.TLSSocket(options.socket, {
                            allowHalfOpen: options.allowHalfOpen,
                            pipe: !!options.path,
                            secureContext: context,
                            isServer: false,
                            requestCert: false, // true,
                            rejectUnauthorized: false, // options.rejectUnauthorized !== false,
                            session: options.session,
                            ALPNProtocols: options.ALPNProtocols,
                            requestOCSP: options.requestOCSP,
                            enableTrace: options.enableTrace,
                            pskCallback: options.pskCallback,
                            highWaterMark: options.highWaterMark,
                            onread: options.onread,
                            signal: options.signal,
                        });
                    }
                    else {
                        clients[connection_id].client = net.Socket();
                    }

                    if (node.overTime > 0) {
                        clients[connection_id].client.setTimeout(node.overTime);
                    }
                    clients[connection_id].client.setKeepAlive(true, 120000);
                    if (host && port) {
                        clients[connection_id].connecting = true;
                        clients[connection_id].client.connect(connOpts, function () {
                            //node.log(RED._("node-red:tcpin.errors.client-connected"));
                            node.status({ fill: "green", shape: "dot", text: "node-red:common.status.connected" });
                            if (clients[connection_id] && clients[connection_id].client) {
                                clients[connection_id].connected = true;
                                clients[connection_id].connecting = false;
                                let event;
                                while (event = dequeue(clients[connection_id].msgQueue)) {
                                    clients[connection_id].client.write(event.msg.payload);
                                    event.nodeDone();
                                }
                                // if (node.out === "time" && node.waitingTime < 0) {
                                if (node.out === "immed") {
                                    clients[connection_id].connected = clients[connection_id].connecting = false;
                                    clients[connection_id].client.end();
                                    delete clients[connection_id];
                                    node.status({});
                                }
                            }
                        });
                    }
                    else {
                        node.warn(RED._("node-red:tcpin.errors.no-host"));
                    }

                    var chunk = "";
                    clients[connection_id].client.on('data', function (data) {
                        if (node.out === "sit") { // if we are staying connected just send the buffer
                            if (clients[connection_id]) {
                                const msg = clients[connection_id].lastMsg || {};
                                msg.payload = RED.util.cloneMessage(data);
                                if (node.ret === "string") {
                                    try {
                                        if (node.newline && node.newline !== "") {
                                            chunk += msg.payload.toString();
                                            let parts = chunk.split(node.newline);
                                            for (var p = 0; p < parts.length - 1; p += 1) {
                                                let m = RED.util.cloneMessage(msg);
                                                m.payload = parts[p];
                                                if (node.trim == true) { m.payload += node.newline; }
                                                nodeSend(m);
                                            }
                                            chunk = parts[parts.length - 1];
                                        }
                                        else {
                                            msg.payload = msg.payload.toString();
                                            nodeSend(msg);
                                        }
                                    }
                                    catch (e) { node.error(RED._("node-red:tcpin.errors.bad-string"), msg); }
                                }
                                else { nodeSend(msg); }
                            }
                        }
                        // else if (node.splitc === 0) {
                        //     clients[connection_id].msg.payload = data;
                        //     node.send(clients[connection_id].msg);
                        // }
                        else {
                            for (var j = 0; j < data.length; j++) {
                                if (node.out === "time") {
                                    if (clients[connection_id]) {
                                        // do the timer thing
                                        if (clients[connection_id].timeout) {
                                            i += 1;
                                            buf[i] = data[j];
                                        }
                                        else {
                                            clients[connection_id].timeout = setTimeout(function () {
                                                if (clients[connection_id]) {
                                                    clients[connection_id].timeout = null;
                                                    const msg = clients[connection_id].lastMsg || {};
                                                    msg.payload = Buffer.alloc(i + 1);
                                                    buf.copy(msg.payload, 0, 0, i + 1);
                                                    if (node.ret === "string") {
                                                        try { msg.payload = msg.payload.toString(); }
                                                        catch (e) { node.error("Failed to create string", msg); }
                                                    }
                                                    nodeSend(msg);
                                                    if (clients[connection_id].client) {
                                                        node.status({});
                                                        clients[connection_id].client.destroy();
                                                        delete clients[connection_id];
                                                    }
                                                }
                                            }, node.waitingTime);
                                            i = 0;
                                            buf[0] = data[j];
                                        }
                                    }
                                }
                                // count bytes into a buffer...
                                else if (node.out == "count") {
                                    buf[i] = data[j];
                                    i += 1;
                                    if (i >= node.waitingLength) {
                                        if (clients[connection_id]) {
                                            const msg = clients[connection_id].lastMsg || {};
                                            msg.payload = Buffer.alloc(i);
                                            buf.copy(msg.payload, 0, 0, i);
                                            if (node.ret === "string") {
                                                try { msg.payload = msg.payload.toString(); }
                                                catch (e) { node.error("Failed to create string", msg); }
                                            }
                                            nodeSend(msg);
                                            if (clients[connection_id].client) {
                                                node.status({});
                                                clients[connection_id].client.destroy();
                                                delete clients[connection_id];
                                            }
                                            i = 0;
                                        }
                                    }
                                }
                                // look for a char
                                else {
                                    buf[i] = data[j];
                                    i += 1;
                                    if (data[j] == node.splitc) {
                                        if (clients[connection_id]) {
                                            const msg = clients[connection_id].lastMsg || {};
                                            msg.payload = Buffer.alloc(i);
                                            buf.copy(msg.payload, 0, 0, i);
                                            if (node.ret === "string") {
                                                try { msg.payload = msg.payload.toString(); }
                                                catch (e) { node.error("Failed to create string", msg); }
                                            }
                                            nodeSend(msg);
                                            if (clients[connection_id].client) {
                                                node.status({});
                                                clients[connection_id].client.destroy();
                                                delete clients[connection_id];
                                            }
                                            i = 0;
                                        }
                                    }
                                }
                            }
                        }
                    });

                    clients[connection_id].client.on('end', function () {
                        // console.log("END");
                        node.status({ fill: "grey", shape: "ring", text: "node-red:common.status.disconnected" });
                        if (clients[connection_id] && clients[connection_id].client) {
                            clients[connection_id].connected = clients[connection_id].connecting = false;
                            clients[connection_id].client = null;
                        }
                    });

                    clients[connection_id].client.on('close', function () {
                        //console.log("CLOSE");
                        if (clients[connection_id]) {
                            clients[connection_id].connected = clients[connection_id].connecting = false;
                        }

                        var anyConnected = false;

                        for (var client in clients) {
                            if (clients[client].connected) {
                                anyConnected = true;
                                break;
                            }
                        }
                        if (node.doneClose && !anyConnected) {
                            clients = {};
                            node.doneClose();
                        }
                    });

                    clients[connection_id].client.on('error', function () {
                        // console.log("ERROR");
                        node.status({ fill: "red", shape: "ring", text: "node-red:common.status.error" });
                        node.error(RED._("node-red:tcpin.errors.connect-fail") + " " + connection_id, msg);
                        if (clients[connection_id] && clients[connection_id].client) {
                            clients[connection_id].client.destroy();
                            delete clients[connection_id];
                        }
                    });

                    clients[connection_id].client.on('timeout', function () {
                        if (clients[connection_id]) {
                            clients[connection_id].connected = clients[connection_id].connecting = false;
                            node.status({ fill: "grey", shape: "dot", text: "node-red:tcpin.errors.connect-timeout" });
                            //node.warn(RED._("node-red:tcpin.errors.connect-timeout"));
                            if (clients[connection_id].client) {
                                // console.log("destroying client",retries,node.maxRetries);
                                retries += 1;
                                if (retries > node.maxRetries) {
                                    // console.log("max retries reached");
                                    clients[connection_id].client.destroy();
                                    delete clients[connection_id];
                                } else {
                                    // console.log("retrying");
                                    clients[connection_id].client.destroy();
                                    i = 0;
                                    enqueue(clients[connection_id].msgQueue, { msg: msg, nodeSend: nodeSend, nodeDone: nodeDone });
                                    setupTcpClient();
                                }
                            }
                        }
                    });
                }

                setupTcpClient();
            }
            else if (!clients[connection_id].connecting && clients[connection_id].connected) {
                if (clients[connection_id] && clients[connection_id].client) {
                    let event = dequeue(clients[connection_id].msgQueue)
                    clients[connection_id].client.write(event.msg.payload);
                    event.nodeDone();
                }
            }
        });

        this.on("close", function (done) {
            node.doneClose = done;
            for (var cl in clients) {
                if (clients[cl].hasOwnProperty("client")) {
                    clients[cl].client.destroy();
                }
            }
            node.status({});

            // this is probably not necessary and may be removed
            var anyConnected = false;
            for (var c in clients) {
                if (clients[c].connected) {
                    anyConnected = true;
                    break;
                }
            }
            if (!anyConnected) { clients = {}; }
            done();
        });

    }
    RED.nodes.registerType("tcp request2", TcpRequest2);
}
