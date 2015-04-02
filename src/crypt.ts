/**
 * Created by fish on 2015/3/30.
 */

///<reference path='../typings/node/node.d.ts' />
///<reference path='../typings/bluebird/bluebird.d.ts' />
///<reference path='../typings/lodash/lodash.d.ts' />
///<reference path='../typings/underscore.string/underscore.string.d.ts' />
///<reference path='../typings/moment/moment.d.ts' />

import fs = require("fs");
import crypto = require("crypto");

var pinKey:Buffer;
var macKey:Buffer;

export function crypt3Des(buf, isDecrypt=false){
    if(!pinKey) return;

    return callCrypt("des-ede3", pinKey, buf, isDecrypt, true);
}

export function cryptDes(buf, isDecrypt=false){
    if(!macKey) return;

    return callCrypt("des-ecb", macKey, buf, isDecrypt);
}

function callCrypt(alg,key,data,isDecrypt,customPadding = false){
    var des;
    if(isDecrypt)
        des = crypto.createDecipheriv(alg, key, "");
    else
        des = crypto.createCipheriv(alg, key, "");

    var paddingData = data;
    des.setAutoPadding(false);
    if(customPadding) {
        paddingData = padding(data);
    }

    var rst = des.update(paddingData);
    rst = Buffer.concat([rst,des.final()]);
    return rst;
}

function padding(data){
    var bt = data;
    if(_.isString(data)) {
        bt = new Buffer(data);
    }

    var len = bt.length;
    var newlen = Math.ceil(len / 8);
    var newbt = bt;
    if (len != newlen * 8) {
        newbt = new Buffer(newlen * 8);
        newbt.fill(0);
        bt.copy(newbt,0);
    }

    return newbt;
}

import path = require("path");

export function createSign(rpid:string, password:string, priKeyPath:string):string {
    var sum = rpid + password;
    var alga = crypto.createHash("sha1");
    alga.update(sum);
    var digestLocal = alga.digest();

    if(priKeyPath) {
        var NodeRSA = require('node-rsa');
        var rsaKey = new NodeRSA(fs.readFileSync(priKeyPath), "pkcs8-private-der");
        return rsaKey.encryptPrivate(digestLocal, 'base64');
    }

    return digestLocal.toString("base64");
}

export function createMAC(bodyStr:string) {
    if(!macKey) return;
    var body = new Buffer(bodyStr);
    var mac_data = new Buffer(8);
    mac_data.fill(0);
    var N8 = Math.ceil(body.length/8);
    var round_data = new Buffer(N8 * 8);
    round_data.fill(0);

    body.copy(round_data);
    _.times(N8, (i)=> {
        mac_data = makeXORnDES(mac_data, round_data, i * 8, 8);
    });
    return mac_data.slice(0, 4);
}

function makeXORnDES(mac_data, round_data, start, len){
    var xor = makeXOR(mac_data, round_data, start, len);
    return cryptDes(xor);
}

function makeXOR(b1:Buffer, b2:Buffer, start:number, n:number) {
    _.times(n,(i)=>{
        b1[i] = b1[i] ^ b2[(start + i)];
    });
    return b1;
}

export function processKey(loginResp, priKeyPath){
    if(!loginResp.key) return Promise.reject(new Error("no key found in login resp"));

    var NodeRSA = require('node-rsa');
    var key = new NodeRSA(fs.readFileSync(priKeyPath),"pkcs8-private-der",{encryptionScheme:"pkcs1"});

    var keyBuf = key.decrypt(new Buffer(loginResp.key,"base64"));
    processKeyBuffer(keyBuf.slice(100));
}

export function processKeyBuffer(keyBuf){
    var key = keyBuf.slice(0,16);
    pinKey = new Buffer(24);
    key.copy(pinKey,0);
    key.copy(pinKey,16,0,8);

    macKey = keyBuf.slice(16,24);
}
