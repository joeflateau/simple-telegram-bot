# Example app
``` javascript
var config = require("./example-config.json");

var token = config.botToken,
    connectionString = config.connectionString;

var Bot = require("node-telegram-bot-api"),
    bot = new Bot(token, { polling: true }),
    Massive = require("massive"),
    db = Massive.connectSync({ connectionString: connectionString }),
    SimpleBot = require('simple-telegram-bot'),
    simpleBot = new SimpleBot(bot, db.users, "echo");

simpleBot.on("chatstarted", function(chat){

    chat.send("Say something!");

    chat.on("command:echo", function(message){
        chat.send(message.text);
    });

    chat.on("command:broadcast", function(message){
        simpleBot.broadcast(message.text);
    });
    
});
```

# Example config
``` javascript
{
    "botToken": "123123123:ABCABCABCABCABCABCABC-ABCABCABCABCA",
    "connectionString": "postgres://username:password@localhost/databasename"
}

```
