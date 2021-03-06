//#!/usr/bin/env node

var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    sets = require('simplesets'),
    util = require('util'),
    jade = require('jade'),
    MemoryStore = express.session.MemoryStore,
    uuid = require('node-uuid'),
    io = require('socket.io'),
    underscore = require('underscore'),
    futures = require('futures'),
    messages = require('./messages.js'),
    autils = require('./utils.js');

var config = require('config')('server', {
  port: 8085,
  sessionSecret: uuid(),
  sessionFile: null
});

// WEB APP CODE
var app = express.createServer(
  express.logger(),
  express.bodyDecoder()
);

var sessionStore = new MemoryStore({reapInterval: 60000 * 10 });

app.configure(function(){
  app.use(express.cookieDecoder());
  app.use(express.session({
    secret: config.sessionSecret,
    store: sessionStore
  }));
  app.use(express.methodOverride());
  app.use(express.bodyDecoder());
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/static'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.set('view engine', 'jade');

function getUserId(req) {
  var future = futures.future();
  var getUserId;
  if (!req.session.userId) {
    getUserId = messages.addUser();
  } else {
    getUserId = futures.future().deliver(null, req.session.userId);
  }
  getUserId.when(function onGetUserId(err, userId) {
    req.session.userId = userId;
    future.callback(req.session.userId);
  });
  return future;
}

function getUser(req) {
  var future = futures.future();
  var loop = futures.loop();
  loop.setMaxLoop(2);
  loop.run(function(next, err) {
    // try to get a user
    getUserId(req).when(function onGetUserId(err, userId) {
      messages.getUserById(userId).when(function onGetUser(err, user) {
        if (err) {
          // no user by that id... reset the session and try again.
          req.session.regenerate(next);
        } else {
          future.deliver(err, user);
        }
      });
    });
  });


  return future;
}

app.get('/', function(req, res) {
  console.log("getting user");
  getUser(req).when(function onGetUser(err, user) {
    console.log("got user");
    var join = futures.join();
    join.add(
      messages.getLastNMessagesExcludingUser(5, user.id),
      user.getCommentedOnMessages(),
      user.getMessages()
    );

    join.when(autils.args(
      function onGetData(globalMessages, commentedOnMessages, userMessages) {
        console.log("got data");
        // remove commentedOnMessages that are the user's own messages
        commentedOnMessages = underscore.select(commentedOnMessages, function(message) {
          return message.userId !== user.id;
        });

        var ignoreIds = new sets.Set(underscore.pluck(commentedOnMessages, 'id'));
        globalMessages = underscore.select(globalMessages, function(message) {
          return !ignoreIds.has(message.id);
        });

        // TODO: make this less painful
        var join = futures.join();
        function joinMessage(message){
          join.add(message.getComments());
        }
        underscore.each(userMessages, joinMessage);
        underscore.each(globalMessages, joinMessage);
        underscore.each(commentedOnMessages, joinMessage);
        // in case no other futures were added
        join.add(futures.future().deliver(null));

        join.when(function() {
          res.render('index', {
            locals: {
              userMessages: userMessages,
              globalMessages: globalMessages,
              commentedOnMessages: commentedOnMessages
            }
          });
        });



      }));

  });

});

app.post('/message', function(req, res) {
  getUser(req).when(function onGetUser(err, user) {
    console.log("got user", user);
    user.add(req.param("content")).when(function onAddMessage(err, messageId) {
      console.log("created new message with id", messageId);
      res.redirect("back");

      messages.getMessageById(messageId).when(function onGetMessage(err, message) {

        message.getComments().when(function() {
          socket.broadcast({
            method: 'dom',
            params: [{
              content: res.partial("message", {locals: {message: message}}),
              target: "#globalMessages > ul",
              position: "prepend"
            }]
          });

        });


      });

    });

  });
});

app.post('/comment', function(req, res) {
  var join = futures.join();
  join.add(
    getUserId(req),
    messages.getMessageById(req.param("messageId"))
  );
  join.when(autils.args(function onGetStuff(userId, message) {
    if (message) {
      message.addComment(userId, req.param("content")).when(function onAddComment(err, commentId){
        res.redirect("back");

        console.log("Created new comment:", commentId);
        messages.getMessageById(req.param("messageId")).when(function onGetMessage(err, message) {

          message.getComments().when(function() {

            socket.broadcast({
              method: 'dom',
              params: [{
                content: res.partial("message", {locals: {message: message}}),
                target: "#"+message.id,
                position: "replace"
              }]
            });

          });

        });
      });
    }
  }));

});

console.log("Loading saved messages");
messages.load();
if (config.sessionFile) {
  console.log("Loading saved sessions");
  path.exists(config.sessionFile, function(exists) {
    if (exists) {
      sessionStore.sessions = JSON.parse(fs.readFileSync(config.sessionFile));
    }
  });
}
console.log("running on port", config.port);
app.listen(config.port);


// SOCKET CODE
var socket = io.listen(app);
socket.on('connection', function(client) {
  var s = socket;
  console.log('connection from', client.sessionId);
  client.on('message', function(msg) {
    console.log("on message", util.inspect(msg));
  });
  client.on('disconnect', function() {
    console.log(client.sessionId, 'disconnected');
  });
});

process.on('SIGINT', function() {
  // oh dang, we are shutting down.  Let's save all the messages to a file real quick!
  console.log("\n\nSaving data and exiting...");
  app.close();
  messages.dump();
  // now let's save the sessions
  if (config.sessionFile) {
    fs.writeFileSync(config.sessionFile, JSON.stringify(sessionStore.sessions));
  }
  process.exit();
});