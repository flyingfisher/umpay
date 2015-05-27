/**
 * Created by fish on 2015/3/25.
 */

///<reference path='../typings/node/node.d.ts' />
///<reference path='../typings/bluebird/bluebird.d.ts' />
///<reference path='../typings/lodash/lodash.d.ts' />
///<reference path='../typings/xml2js/xml2js.d.ts' />

import net = require("net");
import events = require("events");

import xml2js = require("xml2js");

var _parser = new xml2js.Parser({normalizeTags:true,explicitArray:false,parseNumbers:false});
var _builder = new xml2js.Builder({
    rootName:"UMPAY",
    xmldec:{version :"1.0",encoding:"GBK"}
});

var parse = Promise.promisify(_parser.parseString,_parser);
var build:any = _.bind(_builder.buildObject,_builder);

import crypt = require("./crypt");

class UmpaySocket extends events.EventEmitter {
    private socket:net.Socket;
    private spId:number;
    private bufferCache;
    private _heartBeatHandle;    

    constructor(private port,
                private host="localhost",
                private options:any={}){
        super();
        this.spId = options.spId;
        _.defaults(this.options,{
            heartbeatTimeout: 180 * 1000,
            priKeyPath:""
        });
    }

    connect() {
        this.disconnect();
        this.socket = new net.Socket();
        var deferred = Promise.defer();
        this.socket.on("connect",()=>{
            deferred.resolve();
        });
        this.socket.on("data",(buffer)=>{
            this.handleData(buffer);
        });
        this.socket.on("error",(err)=>{
            this.emit("error",err);
        });
        this.socket.on("close",()=>{
            this.emit("disconnect");
            this.socket.destroy();
            this.socket = undefined;
        });
        this.socket.connect(this.port,this.host);
        return deferred.promise;
    }

    send(seqNo, msgProperty, msgSafeMark, message){
        if(!message) return;
        // remove undefined or null key
        for(var key in message){
            if(!message.hasOwnProperty(key)) continue;
            if(_.isNull(message[key]) || _.isUndefined(message[key]))
                delete message[key];
        }

        var messageStr = build(message);
        var buf = this.createBuffer(seqNo, msgProperty, msgSafeMark, messageStr);
        this.socket.write(buf);
    }

    handleData(buffer){
        if(!this.bufferCache) {
            this.bufferCache = buffer;
        }else{
            this.bufferCache = Buffer.concat([this.bufferCache,buffer]);
        }
        
        var obj={msg:undefined};
        while(this.fetchData(obj)){
            this.handleBuffer(obj.msg);
        }
    }

    fetchData(obj){
        if(!obj) return false;
        if(this.bufferCache.length<32) return false;
        
        obj.msg = this.readBuf(this.bufferCache);
        if(!obj.msg) return false;
        
        if(obj.msg.length > this.bufferCache.length ) return false;
        
        this.bufferCache = this.bufferCache.slice(obj.msg.length);
        return true;
    }
    

    handleBuffer(msg){        
        if(msg.msgProperty === 82) return; // heart beat

        var messageBody;
        if (msg.msgProperty === 50) {
            messageBody = msg.bodyBuf.toString("gbk");
            parse(messageBody).then((rst)=>{
                if (rst && rst.umpay) {
                    if (rst.umpay.retcode === "0000") {
                        crypt.processKey(rst.umpay,this.options.priKeyPath);
                        if(!this._heartBeatHandle)
                            this.handleHeartbeat();
                    }

                    this.emit("received", _.extend(msg, {body: rst.umpay}));
                }
                else
                    this.emit("error", new Error("unknown rst:"+JSON.stringify(rst)));
            });
        }

        if (msg.msgProperty === 2) {
            if(msg.msgSafeMark === 1){
                messageBody = crypt.crypt3Des(msg.bodyBuf, true).toString("gbk");
            }
            else {
                messageBody = msg.bodyBuf.toString("gbk");
            }

            parse(messageBody).then((rst)=>{
                this.emit("received", _.extend(msg,{body:rst.umpay}));
            });
        }
    }

    handleHeartbeat(){
        var seqNo = 1000;
        var msgProperty = 80;
        var msgSafeMark = 0;
        var buf = this.createBuffer(seqNo,msgProperty,msgSafeMark,null);
        this.socket.write(buf);
        this._heartBeatHandle = setTimeout(()=>{
            this.handleHeartbeat();
        }, this.options.heartbeatTimeout);
    }

    createBuffer(seqNo, msgProperty, msgSafeMark, messageBodyStr?) {
        var sendMsg;
        if(msgProperty !== 48 && msgSafeMark === 1 && messageBodyStr) {
            sendMsg = crypt.crypt3Des(messageBodyStr);
        }
        else if (messageBodyStr)
            sendMsg = new Buffer(messageBodyStr);


        var msgLength = sendMsg? (32 + sendMsg.length) : 32;
        var buf = new Buffer(msgLength);
        buf.fill(0);

        var i = 0;
        buf.writeUInt8(85,i);
        i+=1;
        buf.writeUInt8(77,i);
        i+=1;
        buf.writeUInt8(49,i);
        i+=1;
        buf.writeUInt8(48,i);
        i+=1;
        buf.writeUInt32BE(msgLength,i);
        i+=4;
        buf.writeUInt32BE(seqNo,i);
        i+=4;
        buf.writeUInt8(msgProperty,i);
        i+=1;
        buf.writeUInt8(msgSafeMark,i);
        i+=1;
        i+=6; // empty custom field
        buf.writeInt16BE(this.spId, i);
        i+=2;
        i+=6; //empty fromTermId,fromReserv,toId,toTermId,toReserv
        if(msgProperty !== 48 && msgSafeMark === 1 && messageBodyStr){
            var mac = crypt.createMAC(messageBodyStr);
            mac.copy(buf,i,0,4);
        }
        i+=4; //if no mac , leave blank

        if(sendMsg) {
            sendMsg.copy(buf,i);
        }

        return buf;
    }

    readBuf(buffer){
        var length = buffer.readUInt32BE(4);
        if(length < 32) return;
        
        var msgProperty = buffer.readInt8(12);
        var msgSafeMark = buffer.readInt8(13);
        var bodyBuf = buffer.slice(32, length);
        return {msgProperty:msgProperty, msgSafeMark:msgSafeMark, bodyBuf:bodyBuf, length:length};
    }

    disconnect(){
        if(this.socket){
            this.socket.end();
            this.socket.destroy();
            this.socket = undefined;
            clearTimeout(this._heartBeatHandle);
            this._heartBeatHandle = undefined;
        }
    }
}

export = UmpaySocket;