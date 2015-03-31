/**
 * Created by fish on 2015/3/27.
 */
///<reference path='typings/node/node.d.ts' />

var options = {
    spId:0,
    merId:"0000",
    heartbeatTimeout:180*1000,
    priKeyPath:"../path/key.pri",
    goodsId:{
        //amount=goodsId
        200:"001"
    }
};

var Client = require("./index");

var client = new Client("port","host",options);

client.login("password");

client.on("logged-in",function(){
    console.log("login success");
    // process here
    client.pay("136xxxxxxxx",200).then((rst)=>{
        console.log(rst);
    });
    client.refund("136xxxxxxxx",{AMOUNT:200,ORDERID:"XXXX"}).then((rst)=>{
        console.log(rst);
    });
});

client.on("error",function(err){
    console.log(err);
});