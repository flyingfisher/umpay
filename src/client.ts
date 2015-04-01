/**
 * Created by fish on 2015/3/26.
 */

///<reference path='../typings/node/node.d.ts' />
///<reference path='../typings/bluebird/bluebird.d.ts' />
///<reference path='../typings/lodash/lodash.d.ts' />
///<reference path='../typings/underscore.string/underscore.string.d.ts' />
///<reference path='../typings/moment/moment.d.ts' />

import events = require("events");
import UmpaySocket = require("./umpaySocket");
import crypt = require("./crypt");
import fs = require("fs");

var random = require("./random");

class UmpayClient extends events.EventEmitter{
    private socket:UmpaySocket;
    private promiseMap = {};
    private mobileOrderMap = {};
    private mobileCount = 0;
    private loginResolve;

    constructor(port, host, private options){
        super();

        _.defaults(options,{
            spId:"",
            merId:"",
            latestOrderIdHolder:{
                file:"./orderfile",
                limit:100
            },
            goodsId:{}
        });

        this.initOrderMap();

        this.socket = new UmpaySocket(port, host, options);

        this.socket.on("received",(msg)=>{
            if(msg.msgProperty === 50){
                if(msg.body.retcode === "0000" || msg.body.retcode === "9976") {
                    this.loginResolve.resolve();
                    this.emit("logged-in");
                }else{
                    var err = new Error("login failed:" + msg.body.memo);
                    this.loginResolve.reject(err);
                    this.emit("error",err);
                }

                return;
            }

            if(msg.msgProperty === 2){
                var promise = this.promiseMap[msg.body.rpid];
                delete this.promiseMap[msg.body.rpid];
                if(!promise){
                    if(msg.body.memo)
                        this.emit("error", new Error(msg.body.memo));
                    else
                        this.emit("error", new Error("no handle found!"));

                    return;
                }

                if(msg.body.retcode === "0000"){
                    if (promise["_payBody"]) {
                        this.writeOrderMap(promise["_payBody"]);
                        promise.resolve(_.extend(promise["_payBody"], msg.body));
                    }
                    else
                        promise.resolve(msg.body);
                }
                else{
                    var err = new Error(msg.body.memo);
                    err["detail"] = msg.body;
                    promise.reject(err);
                }

                return;
            }

            this.emit("error", new Error("unknown msg found:"+JSON.stringify(msg)));
        });

        this.socket.on("error",(err)=>{
            this.emit("error", err);
        });
    }

    initOrderMap(){
        if(this.options.latestOrderIdHolder){
            var strBack = "";
            if(fs.existsSync(this.options.latestOrderIdHolder.file+".bak"))
                strBack = fs.readFileSync(this.options.latestOrderIdHolder.file+".bak","utf8")||"";
            var str = "";
            if(fs.existsSync(this.options.latestOrderIdHolder.file))
                str = fs.readFileSync(this.options.latestOrderIdHolder.file,"utf8")||"";
            var list = _s.lines(strBack+str);
            list && list.forEach((it)=>{
                if(_s.isBlank(it)) return;

                var payObj = JSON.parse(it);
                this.mobileOrderMap[it.MOBILENO] = it;
                this.mobileCount ++;
            });
        }
    }

    writeOrderMap(pay){
        this.mobileOrderMap[pay.MOBILENO] = pay;
        if(this.options.latestOrderIdHolder) {
            fs.appendFile(this.options.latestOrderIdHolder.file, JSON.stringify(pay)+"\n");
            this.mobileCount ++;
            if(this.mobileCount > this.options.latestOrderIdHolder.limit){
                this.truncateFile();
            }
        }
    }

    truncateFile(){
        if(fs.existsSync(this.options.latestOrderIdHolder.file+".bak"))
            fs.unlink(this.options.latestOrderIdHolder.file+".bak");
        fs.rename(this.options.latestOrderIdHolder.file,this.options.latestOrderIdHolder.file+".bak");
        fs.truncate(this.options.latestOrderIdHolder.file);
        this.mobileCount = 0;
        this.mobileOrderMap = {};
        this.initOrderMap();
    }

    login(password){
        if(this.loginResolve) return;

        this.loginResolve = Promise.defer();
        this.socket.connect().then(()=>{
            var rpId = this.generateRpid();
            var sign = crypt.createSign(rpId, password);
            this.socket.send(1000, 48, 1, {RPID:rpId, SIGN:sign});
        });
    }

    pay(mobile,amount=200){
        if(!this.loginResolve) return Promise.reject(new Error("not logged in"));

        return this.loginResolve.promise.then(()=>{
            var obj = this.createMessageBody(mobile,amount,"1000");
            this.socket.send(1000, 0, 1, obj);

            var deferred = Promise.defer();
            deferred["_payBody"] = obj;
            this.promiseMap[obj.RPID] = deferred;
            return deferred.promise;
        });
    }

    refund(mobile:string, payBody?:{AMOUNT:any; ORDERID:string}){
        if(!this.loginResolve) return Promise.reject(new Error("not logged in"));

        if (!payBody) payBody = this.mobileOrderMap[mobile];
        if (!payBody) return Promise.reject(new Error("not pay body found"));

        return this.loginResolve.promise.then(()=> {
            var obj = this.createMessageBody(mobile, payBody.AMOUNT, "1001");
            delete obj["PAYTYPE"];
            obj.ORDERID = payBody.ORDERID;
            this.socket.send(1000, 0, 1, obj);

            var deferred = Promise.defer();
            this.promiseMap[obj.RPID] = deferred;
            return deferred.promise;
        });
    }

    createMessageBody(mobile,amount,funCode){
        var rpId = this.generateRpid();
        return {
            FUNCODE:funCode,
            RPID: rpId,
            REQDATE:moment().format("YYYYMMDD"),
            REQTIME:moment().format("HHmmss"),
            MOBILENO:mobile,
            CALLED:this.options.spId,
            AMOUNT:amount,
            PAYTYPE:"2",
            MERID:this.options.merId,
            ORDERID:random.id(),
            GOODSID:this.options.goodsId[amount]||"001",
            GOODSNUM:"1"
        };
    }

    generateRpid(){
        var time = moment().unix().toString();
        var sid = _s.lpad(_.random(1000).toString(), 3, "0");
        return time+sid;
    }
}

export = UmpayClient;