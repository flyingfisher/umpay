/**
 * Created by fish on 2015/3/26.
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
///<reference path='../typings/underscore.string/underscore.string.d.ts' />
///<reference path='../typings/moment/moment.d.ts' />
var events = require("events");
var UmpaySocket = require("./umpaySocket");
var crypt = require("./crypt");
var fs = require("fs");
var random = require("./random");
var UmpayClient = (function (_super) {
    __extends(UmpayClient, _super);
    function UmpayClient(port, host, options) {
        var _this = this;
        _super.call(this);
        this.options = options;
        this.isLogin = false;
        this.promiseMap = {};
        this.mobileOrderMap = {};
        this.mobileCount = 0;
        _.defaults(options, {
            spId: "",
            merId: "",
            latestOrderIdHolder: {
                file: "./orderfile",
                limit: 100
            },
            goodsId: {}
        });
        this.initOrderMap();
        this.socket = new UmpaySocket(port, host, options);
        this.socket.on("received", function (msg) {
            if (msg.msgProperty === 50) {
                if (msg.isLogin)
                    return;
                if (msg.body.retcode === "0000") {
                    _this.isLogin = true;
                    _this.emit("logged-in");
                }
                else if (msg.body.retcode === "9976") {
                    _this.isLogin = true;
                    _this.emit("logged-in");
                }
                else {
                    _this.emit("error", new Error("login failed:" + msg.body.memo));
                }
                return;
            }
            if (msg.msgProperty === 2) {
                var promise = _this.promiseMap[msg.body.rpid];
                delete _this.promiseMap[msg.body.rpid];
                if (!promise) {
                    if (msg.body.memo)
                        _this.emit("error", new Error(msg.body.memo));
                    else
                        _this.emit("error", new Error("no handle found!"));
                    return;
                }
                if (msg.body.retcode === "0000") {
                    if (promise["_payBody"])
                        _this.writeOrderMap(promise["_payBody"]);
                    promise.resolve(promise["_payBody"] || msg.body);
                }
                else {
                    promise.reject(new Error(msg.body.memo));
                }
                return;
            }
            _this.emit("error", new Error("unknown msg found:" + JSON.stringify(msg)));
        });
        this.socket.on("error", function (err) {
            _this.emit("error", err);
        });
    }
    UmpayClient.prototype.initOrderMap = function () {
        var _this = this;
        if (this.options.latestOrderIdHolder) {
            var strBack = "";
            if (fs.existsSync(this.options.latestOrderIdHolder.file + ".bak"))
                strBack = fs.readFileSync(this.options.latestOrderIdHolder.file + ".bak", "utf8") || "";
            var str = "";
            if (fs.existsSync(this.options.latestOrderIdHolder.file))
                str = fs.readFileSync(this.options.latestOrderIdHolder.file, "utf8") || "";
            var list = _s.lines(strBack + str);
            list && list.forEach(function (it) {
                if (_s.isBlank(it))
                    return;
                var payObj = JSON.parse(it);
                _this.mobileOrderMap[it.MOBILENO] = it;
                _this.mobileCount++;
            });
        }
    };
    UmpayClient.prototype.writeOrderMap = function (pay) {
        this.mobileOrderMap[pay.MOBILENO] = pay;
        if (this.options.latestOrderIdHolder) {
            fs.appendFile(this.options.latestOrderIdHolder.file, JSON.stringify(pay) + "\n");
            this.mobileCount++;
            if (this.mobileCount > this.options.latestOrderIdHolder.limit) {
                this.truncateFile();
            }
        }
    };
    UmpayClient.prototype.truncateFile = function () {
        if (fs.existsSync(this.options.latestOrderIdHolder.file + ".bak"))
            fs.unlink(this.options.latestOrderIdHolder.file + ".bak");
        fs.rename(this.options.latestOrderIdHolder.file, this.options.latestOrderIdHolder.file + ".bak");
        fs.truncate(this.options.latestOrderIdHolder.file);
        this.mobileCount = 0;
    };
    UmpayClient.prototype.login = function (password) {
        var _this = this;
        if (this.isLogin)
            return;
        this.socket.connect().then(function () {
            var rpId = _this.generateRpid();
            var sign = crypt.createSign(rpId, password);
            _this.socket.send(1000, 48, 1, { RPID: rpId, SIGN: sign });
        });
    };
    UmpayClient.prototype.pay = function (mobile, amount) {
        if (amount === void 0) { amount = 200; }
        if (!this.isLogin)
            return Promise.reject(new Error("not logged in"));
        var obj = this.createMessageBody(mobile, amount, "1000");
        this.socket.send(1000, 0, 1, obj);
        var deferred = Promise.defer();
        deferred["_payBody"] = obj;
        this.promiseMap[obj.RPID] = deferred;
        return deferred.promise;
    };
    UmpayClient.prototype.refund = function (mobile, payBody) {
        if (!this.isLogin)
            return Promise.reject(new Error("not logged in"));
        if (!payBody)
            payBody = this.mobileOrderMap[mobile];
        if (!payBody)
            return Promise.reject(new Error("not pay body found"));
        var obj = this.createMessageBody(mobile, payBody.AMOUNT, "1001");
        delete obj["PAYTYPE"];
        obj.ORDERID = payBody.ORDERID;
        this.socket.send(1000, 0, 1, obj);
        var deferred = Promise.defer();
        this.promiseMap[obj.RPID] = deferred;
        return deferred.promise;
    };
    UmpayClient.prototype.createMessageBody = function (mobile, amount, funCode) {
        var rpId = this.generateRpid();
        return {
            FUNCODE: funCode,
            RPID: rpId,
            REQDATE: moment().format("YYYYMMDD"),
            REQTIME: moment().format("HHmmss"),
            MOBILENO: mobile,
            CALLED: this.options.spId,
            AMOUNT: amount,
            PAYTYPE: "2",
            MERID: this.options.merId,
            ORDERID: random.id(),
            GOODSID: this.options.goodsId[amount] || "001",
            GOODSNUM: "1"
        };
    };
    UmpayClient.prototype.generateRpid = function () {
        var time = moment().unix().toString();
        var sid = _s.lpad(_.random(1000).toString(), 3, "0");
        return time + sid;
    };
    return UmpayClient;
})(events.EventEmitter);
module.exports = UmpayClient;
//# sourceMappingURL=client.js.map