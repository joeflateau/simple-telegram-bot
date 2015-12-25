var util = require("util"),
    EventEmitter = require("events").EventEmitter,
    Promise = require('bluebird');

function Command(command, text, message, chat) {
    this.command = command;
    this.text = text;
    this.message = message;
    this.chat = chat;
}

Command.prototype.prompt = function(question, options){
    var text = this.text;
    var chat = this.chat;

    return new Promise(function(resolve, reject){
        if (text) {
            resolve(text);
        } else {
            chat.send(question, options);
            chat.removeAllListeners("textreply");
            chat.once("textreply", function(reply){
                resolve(reply.text);
            });
        }
    });
};

function Chat(chatId, bot) {
    EventEmitter.call(this);
    
    this.id = chatId;
    this.bot = bot;
}

util.inherits(Chat, EventEmitter);

Chat.prototype.send = function(text, options) {
    if (text.length > 4096) {
        text = text.substring(0, 4093) + "...";
    }
    this.bot.bot.sendMessage(this.id, text, util._extend({
        parse_mode: "Markdown"
    }, options));
    return this;
};
Chat.prototype.sendAction = function(action) {
    this.bot.bot.sendChatAction(this.id, action);
    return this;
};
Chat.prototype.setting = function(key, value) {
    var chat = this;
    var chatId = chat.id;
    var table = this.bot.table;
    var appName = this.bot.appName;
    if (arguments.length === 2) {
        var settings = this.settings || {};
        settings[key] = value;
        return table.updateAsync({ id: chatId, app_name: appName, settings: settings })
            .then(function(){
                return value;
            });
    } else if (arguments.length === 1) {
        return this.settings[key];
    } else {
        throw new Error("Invalid number of arguments");
    }
};

Chat.prototype.prompt = function(question, options){
    var chat = this;

    return new Promise(function(resolve, reject){
        chat.send(question, options);
        chat.removeAllListeners("textreply");
        chat.once("textreply", function(reply){
            resolve(reply.text);
        });
    });
};

function SimpleBot(bot, table, appName){
    var sb = this;

    EventEmitter.call(this);

    this.bot = bot;

    this.chats = {};

    this.table = table;

    this.appName = appName;

    Promise.promisifyAll(table);

    this.bot.on("message", function(message){
        try {
            var chat = sb.getOrCreateChatById(message.chat.id, message.from);
            chat.emit("message", message);
        } catch (err) {
            console.error(err);
        }
    });
}

util.inherits(SimpleBot, EventEmitter);


SimpleBot.prototype.broadcast = function(text) {
    return this.listAllChats()
        .then(function(chats){
            return Promise.all(chats.map(function(chat){
                chat.send(text);
            }));
        });

    return this;
};

SimpleBot.prototype.listAllChatIds = function() {
    return this.table.findAsync({ app_name: this.appName }, { columns: ["id"] })
        .then(function(users){
            return users.map(function(user){ return user.id; });
        });
};

SimpleBot.prototype.listAllChats = function() {
    var sb = this;
    return this.listAllChatIds()
        .then(function(chatIds){
            return chatIds.map(function(id){ return sb.getOrCreateChatById(id); });
        });
};

SimpleBot.prototype.getOrCreateChatById = function getOrCreateChatById(chatId, from) {
    var table = this.table;
    var appName = this.appName;

    if (this.chats[chatId]) {
        console.log("Continuing chat " + chatId);
        return this.chats[chatId];
    }

    console.log("Creating chat " + chatId);

    var newChat = new Chat(chatId, this);
    this.chats[chatId] = newChat;

    var init = table.findAsync({ id: chatId, app_name: appName }, {  })
        .then(function(rows) {
            if (rows.length > 0) {
                var userRow = rows[0];
                var user = userRow.user;
                console.log("Chat started with " + user.first_name + " " + user.last_name);
                newChat.user = user;
                newChat.settings = userRow.settings || {};
                return rows;
            } else {
                if (!from) throw new Error("New user but no from information");
                return table.insertAsync({ id: newChat.id, app_name: appName, user: from, settings: {} })
                    .then(function(inserted) {
                        if (inserted) {
                            console.log(inserted);
                            newChat.user = from;
                            newChat.settings = {};
                            newChat.emit("newuser");
                        }
                    });
            }
            throw new Error("User not found");
        });

    init.done(function(){
        this.emit("chatstarted", newChat);
    }.bind(this));

    newChat.on("message", function(message){
        init.done(function(){
            if (message.text.indexOf("/") === 0) {
                var match = /\/(\w+)(\s?)(.*)/.exec(message.text),
                    command = match[1],
                    text = match[3];

                console.log("command");
                if (EventEmitter.listenerCount(newChat, "command:" + command) > 0) {
                    newChat.emit("command:" + command, new Command(command, text, message, newChat));
                } else {
                    console.error("Unkown command: " + command);
                }
            } else if (EventEmitter.listenerCount(newChat, "textreply") > 0) {
                console.log("textreply");
                newChat.emit("textreply", { text: message.text, message: message, chat: newChat });
            } else {
                console.log("text");
                newChat.emit("text", { text: message.text, message: message, chat: newChat });
            }
        });
    });

    newChat.on("command:set", function(message){
        return message.prompt("Which setting?")
            .then(function(key){
                return newChat.prompt("New value?")
                    .then(function(value){
                        return newChat.setting(key, value);
                    })
            })
    })

    return newChat;
}

module.exports = SimpleBot;