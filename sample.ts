/**
 * Created by fish on 2015/3/27.
 */
///<reference path='typings/node/node.d.ts' />

var options = {
    spId:0,
    merId:"0000",
    heartbeatTimeout:180*1000,
    priKeyPath:"../path/key.pri",
    latestOrderIdHolder: {
        file:"./orderHolder",
        limit:100
    },
    goodsId:{
        //amount=goodsId
        200:"001"
    }
};

var Client = require("umpay");

var client = new Client("port","host",options);

client.login("password");

client.on("logged-in",function(){
    console.log("login success");
});

client.on("error",function(err){
    console.log(err);
});

client.pay("136xxxxxxxx",200).then((rst)=>{
    console.log(rst);
}).catch((err)=>{
    console.log(err);
});

client.refund("136xxxxxxxx",{AMOUNT:200,ORDERID:"XXXX"}).then((rst)=>{
    console.log(rst);
}).catch((err)=>{
    console.log(err);
});

// JUST do like this

client.pay("136xxxxxxxx").then((rst)=>{
    console.log("pay success");
    //do job
    if("not success") {
        client.refund("136xxxxxxxx", rst).then(function () {
            console.log("refund success")
        }).catch(function(err){
            console.log("refund err",err);
        });
    }
}).catch(function(err){
    console.log("pay err", err);
});