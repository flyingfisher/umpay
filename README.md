# node-umpay
This is an implementation for UMPAY private version.

Now the project passed basic test. But it is not fully tested.

This project is write in Typescript 1.4.

File sample.ts is example code. File index.js is the entry.

Dependence:

This project is dependent on [java](https://github.com/joeferner/node-java). You should prepare you environment according to this project.

Api:
```
   Available options:
{
   	spId:"xxx",
    merId:"xxx",
    heartbeatTimeout:180*1000,
    priKeyPath:"path/prikey",
    latestOrderIdHolder: {
        file:"./orderHolder",
        limit:100
    },
    goodsId:{
        //amount=goodsId        
    }
}
```

P.S. all option in constructor can be emitted.

latestOrderIdHolder: hold pay order detail, because you need orderId and amount to refund. 

You can open sample.ts to see detail.

I will be pleasure if this helps.
