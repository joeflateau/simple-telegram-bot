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

function Chat(chatId, table, bot) {
    EventEmitter.call(this);
    
    this.id = chatId;
    this.table = table;
    this.bot = bot;
}

util.inherits(Chat, EventEmitter);

Chat.prototype.send = function(text, options) {
    this.bot.sendMessage(this.id, text, util._extend({
        parse_mode: "Markdown"
    }, options));
    return this;
};
Chat.prototype.sendAction = function(action) {
    bot.sendChatAction(this.id, action);
    return this;
};
Chat.prototype.setting = function(key, value) {
    var chat = this;
    var chatId = chat.id;
    var table = this.table;
    if (arguments.length === 2) {
        var settings = this.settings || {};
        settings[key] = value;
        return table.updateAsync({ id: chatId, settings: settings })
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

function SimpleBot(bot, table){
    var sb = this;

    EventEmitter.call(this);

    this.bot = bot;

    this.chats = {};

    this.table = table;

    Promise.promisifyAll(table);

    this.bot.on("message", function(message){
        try {
            var chat = sb.getOrCreateChatById(message.chat.id);
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
    return this.table.findAsync({}, { columns: ["id"] })
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

SimpleBot.prototype.getOrCreateChatById = function getOrCreateChatById(chatId) {
    var table = this.table;

    if (this.chats[chatId]) {
        console.log("Continuing chat " + chatId);
        return this.chats[chatId];
    }

    console.log("Creating chat " + chatId);

    var newChat = new Chat(chatId, table, this.bot);
    this.chats[chatId] = newChat;

    var init = table.findAsync(Number(chatId), {  })
        .then(function(userRow) {
            if (userRow) {
                var user = userRow.user;
                console.log("Chat started with " + user.first_name + " " + user.last_name);
                newChat.user = user;
                newChat.settings = userRow.settings || {};
                return userRow;
            } else {
                return table.insertAsync({ id: chat.id, user: e.message.from, settings: {} })
                    .then(function(inserted) {
                        if (inserted) {
                            console.log(inserted);
                            newChat.user = e.message.from;
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

                    newChat.emit("command:" + command, new Command(command, text, message, newChat));
            } else if (newChat.listenerCount("textreply") > 0) {
                newChat.emit("textreply", { text: message.text, message: message, chat: newChat });
            } else {
                newChat.emit("text", { text: message.text, message: message, chat: newChat });
            }
        });
    });

    return newChat;
}

module.exports = SimpleBot;