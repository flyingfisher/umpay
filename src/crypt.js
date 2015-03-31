/**
 * Created by fish on 2015/3/30.
 */
///<reference path='../typings/node/node.d.ts' />
///<reference path='../typings/bluebird/bluebird.d.ts' />
///<reference path='../typings/lodash/lodash.d.ts' />
///<reference path='../typings/underscore.string/underscore.string.d.ts' />
///<reference path='../typings/moment/moment.d.ts' />
var fs = require("fs");
var crypto = require("crypto");
var java = require("java");
var mvn = require('node-java-maven');
var rsaKey;
var pinKey;
var macKey;
function loadPriKey(path) {
    var NodeRSA = require('node-rsa');
    rsaKey = new NodeRSA(fs.readFileSync(path), "pkcs8-private-der");
}
exports.loadPriKey = loadPriKey;
function crypt3Des(buf, isDecrypt) {
    if (isDecrypt === void 0) { isDecrypt = false; }
    if (!pinKey)
        return;
    return callCrypt("des-ede3", pinKey, buf, isDecrypt, true);
}
exports.crypt3Des = crypt3Des;
function cryptDes(buf, isDecrypt) {
    if (isDecrypt === void 0) { isDecrypt = false; }
    if (!macKey)
        return;
    return callCrypt("des-ecb", macKey, buf, isDecrypt);
}
exports.cryptDes = cryptDes;
function callCrypt(alg, key, data, isDecrypt, customPadding) {
    if (customPadding === void 0) { customPadding = false; }
    var des;
    if (isDecrypt)
        des = crypto.createDecipheriv(alg, key, "");
    else
        des = crypto.createCipheriv(alg, key, "");
    var paddingData = data;
    des.setAutoPadding(false);
    if (customPadding) {
        paddingData = padding(data);
    }
    var rst = des.update(paddingData);
    rst = Buffer.concat([rst, des.final()]);
    return rst;
}
function padding(data) {
    var bt = data;
    if (_.isString(data)) {
        bt = new Buffer(data, "gbk");
    }
    var len = bt.length;
    var newlen = Math.ceil(len / 8);
    var newbt = bt;
    if (len != newlen * 8) {
        newbt = new Buffer(newlen * 8);
        newbt.fill(0);
        bt.copy(newbt, 0);
    }
    return newbt;
}
var javaPromise = new Promise(function (resolve, reject) {
    mvn({
        repositories: [
            {
                id: 'maven-yuhong',
                url: 'http://dev2.yuhongtech.net:8081/nexus/content/groups/public/'
            }
        ]
    }, function (err, mvnResults) {
        if (err) {
            reject(new Error('could not resolve maven dependencies:' + err.message));
        }
        mvnResults.classpath.forEach(function (c) {
            java.classpath.push(c);
        });
        resolve();
    });
});
function getPikAndMak(priFilePath, key) {
    return javaPromise.then(function () {
        var values = java.callStaticMethodSync("PIKMACTool", "getPikAndMak", priFilePath, key);
        var buf = new Buffer(values.length);
        values.forEach(function (it, idx) {
            buf.writeInt8(it, idx);
        });
        return buf;
    });
}
function createSign(rpid, password) {
    var sum = rpid + password;
    var alga = crypto.createHash("sha1");
    alga.update(sum);
    var digestLocal = alga.digest();
    if (!rsaKey)
        return digestLocal.toString("base64");
    return rsaKey.encryptPrivate(digestLocal, 'base64');
}
exports.createSign = createSign;
function createMAC(bodyStr) {
    if (!macKey)
        return;
    var body = new Buffer(bodyStr);
    var mac_data = new Buffer(8);
    mac_data.fill(0);
    var N8 = Math.ceil(body.length / 8);
    var round_data = new Buffer(N8 * 8);
    round_data.fill(0);
    body.copy(round_data);
    _.times(N8, function (i) {
        mac_data = makeXORnDES(mac_data, round_data, i * 8, 8);
    });
    return mac_data.slice(0, 4);
}
exports.createMAC = createMAC;
function makeXORnDES(mac_data, round_data, start, len) {
    var xor = makeXOR(mac_data, round_data, start, len);
    return cryptDes(xor);
}
function makeXOR(b1, b2, start, n) {
    _.times(n, function (i) {
        b1[i] = b1[i] ^ b2[(start + i)];
    });
    return b1;
}
function processKey(loginResp, priKeyPath) {
    if (!loginResp.key)
        return Promise.reject(new Error("no key found in login resp"));
    return getPikAndMak(priKeyPath, loginResp.key).then(function (keyBuf) {
        processKeyBuffer(keyBuf);
    });
}
exports.processKey = processKey;
function processKeyBuffer(keyBuf) {
    var key = keyBuf.slice(0, 16);
    pinKey = new Buffer(24);
    key.copy(pinKey, 0);
    key.copy(pinKey, 16, 0, 8);
    macKey = keyBuf.slice(16, 24);
}
exports.processKeyBuffer = processKeyBuffer;
//# sourceMappingURL=crypt.js.map