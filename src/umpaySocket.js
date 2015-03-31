/**
 * Created by fish on 2015/3/25.
 */
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
///<reference path='../typings/node/node.d.ts' />
///<reference path='../typings/bluebird/bluebird.d.ts' />
///<reference path='../typings/lodash/lodash.d.ts' />
///<reference path='../typings/xml2js/xml2js.d.ts' />
var net = require("net");
var events = require("events");
var xml2js = require("xml2js");
var _parser = new xml2js.Parser({ normalizeTags: true, explicitArray: false });
var _builder = new xml2js.Builder({
    rootName: "UMPAY",
    xmldec: { version: "1.0", encoding: "GBK" }
});
var parse = Promise.promisify(_parser.parseString, _parser);
var build = _.bind(_builder.buildObject, _builder);
var crypt = require("./crypt");
var UmpaySocket = (function (_super) {
    __extends(UmpaySocket, _super);
    function UmpaySocket(port, host, options) {
        if (host === void 0) { host = "localhost"; }
        if (options === void 0) { options = {}; }
        _super.call(this);
        this.port = port;
        this.host = host;
        this.options = options;
        this.spId = options.spId;
        _.defaults(this.options, {
            heartbeatTimeout: 180 * 1000,
            priKeyPath: ""
        });
        if (options.priKeyPath)
            crypt.loadPriKey(options.priKeyPath);
    }
    UmpaySocket.prototype.connect = function () {
        var _this = this;
        this.disconnect();
        this.socket = new net.Socket();
        var deferred = Promise.defer();
        this.socket.on("connect", function () {
            deferred.resolve();
        });
        this.socket.on("data", function (buffer) {
            _this.handleBuffer(buffer);
        });
        this.socket.on("error", function (err) {
            _this.emit("error", err);
        });
        this.socket.connect(this.port, this.host);
        return deferred.promise;
    };
    UmpaySocket.prototype.send = function (seqNo, msgProperty, msgSafeMark, message) {
        var messageStr = build(message);
        var buf = this.createBuffer(seqNo, msgProperty, msgSafeMark, messageStr);
        this.socket.write(buf);
    };
    UmpaySocket.prototype.handleBuffer = function (buffer) {
        var _this = this;
        var msg = this.readBuf(buffer);
        if (msg.msgProperty === 82)
            return; // heart beat
        var messageBody;
        if (msg.msgProperty === 50) {
            messageBody = msg.bodyBuf.toString("gbk");
            parse(messageBody).then(function (rst) {
                if (rst && rst.umpay) {
                    if (rst.umpay.retcode === "0000") {
                        crypt.processKey(rst.umpay, _this.options.priKeyPath).then(function () {
                            _this.emit("received", _.extend(msg, { body: rst.umpay }));
                        });
                        _this.handleHeartbeat();
                    }
                    else
                        _this.emit("received", _.extend(msg, { body: rst.umpay }));
                }
                else
                    _this.emit("error", new Error("unknown rst:" + JSON.stringify(rst)));
            });
        }
        if (msg.msgProperty === 2) {
            if (msg.msgSafeMark === 1) {
                messageBody = crypt.crypt3Des(msg.bodyBuf, true).toString("gbk");
            }
            else {
                messageBody = msg.bodyBuf.toString("gbk");
            }
            parse(messageBody).then(function (rst) {
                _this.emit("received", _.extend(msg, { body: rst.umpay }));
            });
        }
    };
    UmpaySocket.prototype.handleHeartbeat = function () {
        var _this = this;
        var seqNo = 1000;
        var msgProperty = 80;
        var msgSafeMark = 0;
        var buf = this.createBuffer(seqNo, msgProperty, msgSafeMark, null);
        this.socket.write(buf);
        setTimeout(function () {
            _this.handleHeartbeat();
        }, this.options.heartbeatTimeout);
    };
    UmpaySocket.prototype.createBuffer = function (seqNo, msgProperty, msgSafeMark, messageBodyStr) {
        var sendMsg;
        if (msgProperty !== 48 && msgSafeMark === 1 && messageBodyStr) {
            sendMsg = crypt.crypt3Des(messageBodyStr);
        }
        else if (messageBodyStr)
            sendMsg = new Buffer(messageBodyStr);
        var msgLength = sendMsg ? (32 + sendMsg.length) : 32;
        var buf = new Buffer(msgLength);
        buf.fill(0);
        var i = 0;
        buf.writeUInt8(85, i);
        i += 1;
        buf.writeUInt8(77, i);
        i += 1;
        buf.writeUInt8(49, i);
        i += 1;
        buf.writeUInt8(48, i);
        i += 1;
        buf.writeUInt32BE(msgLength, i);
        i += 4;
        buf.writeUInt32BE(seqNo, i);
        i += 4;
        buf.writeUInt8(msgProperty, i);
        i += 1;
        buf.writeUInt8(msgSafeMark, i);
        i += 1;
        i += 6; // empty custom field
        buf.writeInt16BE(this.spId, i);
        i += 2;
        i += 6; //empty fromTermId,fromReserv,toId,toTermId,toReserv
        if (msgProperty !== 48 && msgSafeMark === 1 && messageBodyStr) {
            var mac = crypt.createMAC(messageBodyStr);
            mac.copy(buf, i, 0, 4);
        }
        i += 4; //if no mac , leave blank
        if (sendMsg) {
            sendMsg.copy(buf, i);
        }
        return buf;
    };
    UmpaySocket.prototype.readBuf = function (buffer) {
        var msgProperty = buffer.readInt8(12);
        var msgSafeMark = buffer.readInt8(13);
        var bodyBuf = buffer.slice(32);
        return { msgProperty: msgProperty, msgSafeMark: msgSafeMark, bodyBuf: bodyBuf };
    };
    UmpaySocket.prototype.disconnect = function () {
        if (this.socket) {
            this.socket.end();
            this.socket.destroy();
            this.socket = undefined;
        }
    };
    return UmpaySocket;
})(events.EventEmitter);
module.exports = UmpaySocket;
//# sourceMappingURL=umpaySocket.js.map