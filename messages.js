var uuid = require('node-uuid'),
    path = require('path'),
    sets = require('simplesets'),
    util = require('util'),
    underscore = require('underscore'),
    fs = require('fs'),
    futures = require('futures');

var config = require('config')('messages', {
  saveToFile: false
});

var MessageStore = {
  _messages: {},
  _messagesInTime: [],

  _add: function(userId, content) {
    var message = new Message(userId, content);
    this._messages[message.id] = message;
    this._messagesInTime.push(message.id);
    console.log("MessageStore._add:", message.id);
    return message.id;
  },

  add: function(userId, content) {
    return futures.future().deliver(null, this._add.apply(this, arguments));
  },

  getById: function(id) {
    return futures.future().deliver(null, this._messages[id]);
  },

  multigetById: function(ids) {
    var result = [];
    for (var i = 0; i < ids.length; i++) {
      result.push(this._messages[ids[i]]);
    }
    return futures.future().deliver(null, result);
  },

  getLastN: function(n) {
    var size = this._messagesInTime.length;
    var messages = [];
    n = Math.min(n, size);
    while (n--) {
      messages.unshift(this._messages[this._messagesInTime[size - 1 - n]]);
    }
    return futures.future().deliver(null, messages);
  },

  getLastNExcludingUser: function(n, userId) {
    var messages = [];
    var index = this._messagesInTime.length;
    while (messages.length < n && --index >= 0) {
      var message = this._messages[this._messagesInTime[index]];
      if (message.userId !== userId) {
        messages.push(message);
      }
    }
    return futures.future().deliver(null, messages);
  },

  dump: function() {
    return {
      _messages: underscore.map(this._messages, function(item) {return item.dump();}),
      _messagesInTime: this._messagesInTime
    };
  },

  load: function(data) {
    console.log("Loading", data._messages.length, "messages");
    underscore.each(data._messages, function(item) {
      this._messages[item.id] = Message.load(item);
    }, this);
    this._messagesInTime = data._messagesInTime;
  }
};

var UserStore = {
  _users: {},

  add: function() {
    var user = new User();
    this._users[user.id] = user;
    return futures.future().deliver(null, user.id);
  },

  getById: function(id) {
    return futures.future().deliver(null, this._users[id]);
  },

  dump: function() {
    return underscore.map(this._users, function(item) {return item.dump();});
  },

  load: function(data) {
    console.log("Loading", data.length, "users");
    underscore.each(data, function(item) {
      this._users[item.id] = User.load(item);
    }, this);
  }
};

var CommentStore = {
  _comments: {},

  _add: function(userId, messageId, content) {
    var comment = new Comment(userId, messageId, content);
    this._comments[comment.id] = comment;
    UserStore._users[userId]._commentIds.push(comment.id);
    return comment.id;
  },

  add: function(userId, messageId, content) {
    return futures.future().deliver(null, this._add.apply(this, arguments));
  },

  getById: function(id) {
    return futures.future().deliver(null, this._comments[id]);
  },

  dump: function() {
    return underscore.map(this._comments, function(item) {return item.dump();});
  },

  load: function(data) {
    console.log("Loading", data.length, "comments");
    underscore.each(data, function(item) {
      this._comments[item.id] = Comment.load(item);
    }, this);
  }

};

function Comment(userId, messageId, content) {
  this.id = uuid();
  this.timestamp = new Date().getTime();
  this.userId = userId;
  this.messageId = messageId;
  this.content = content;
};
Comment.load = function(data) {
  return underscore.extend(new Comment(), data);
};
Comment.prototype = {
  getUser: function() {
    return UserStore.getById(this.userId);
  },

  getMessage: function() {
    return MessageStore.getById(this.messageId);
  },

  dump: function() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      userId: this.userId,
      messageId: this.messageId,
      content: this.content
    };
  }
};

function Message(userId, content) {
  this.id = uuid();
  this.timestamp = new Date().getTime();
  this.userId = userId;
  this.content = content;
  this.commentIds = [];
}
Message.load = function(data) {
  return underscore.extend(new Message(), data);
};
Message.prototype = {
  getUser: function() {
    return UserStore.getById(this.userId);
  },

  addComment: function(userId, content) {
    var commentId = CommentStore._add(userId, this.id, content);
    this.commentIds.push(commentId);
    return futures.future().deliver(null, commentId);
  },

  getComments: function() {
    console.log("getting comments for", this.id);
    var comments = [];
    for (var i = 0; i < this.commentIds.length; i++) {
      comments.push(CommentStore._comments[this.commentIds[i]]);
    }
    this.comments = comments;
    return futures.future().deliver(null, comments);
  },

  dump: function() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      userId: this.userId,
      content: this.content,
      commentIds: this.commentIds
    };
  }
};


function User() {
  this.id = uuid();
  this._messageIds = [];
  this._commentIds = [];
}
User.load = function(data) {
  return underscore.extend(new User(), data);
};
User.prototype = {
  add: function(content) {
    var messageId = MessageStore._add(this.id, content);
    this._messageIds.push(messageId);
    return futures.future().deliver(null, messageId);
  },

  getMessages: function() {
    var messages = [];
    for (var i = 0; i < this._messageIds.length; i++) {
      messages.unshift(MessageStore._messages[this._messageIds[i]]);
    }
    return futures.future().deliver(null, messages);
  },

  _getCommentedOnMessageIds: function() {
    var ids = new sets.Set();
    for (var i = 0; i < this._commentIds.length; i++) {
      ids.add(CommentStore._comments[this._commentIds[i]].messageId);
    }
    return ids.array();
  },

  getCommentedOnMessageIds: function() {
    return futures.future().deliver(null, this._getCommentedOnMessageIds());
  },

  getCommentedOnMessages: function() {
    return MessageStore.multigetById(this._getCommentedOnMessageIds());
  },

  dump: function() {
    return {
      id: this.id,
      _messageIds: this._messageIds,
      _commentIds: this._commentIds
    };
  }
};


module.exports = {

  dump: function() {
    // dump all the data out to a file
    if (!config.saveToFile) {
      return;
    }
    var data = {
      users: UserStore.dump(),
      messages: MessageStore.dump(),
      comments: CommentStore.dump()
    };
    fs.writeFileSync(config.saveToFile, JSON.stringify(data));
  },

  load: function() {
    // load all the data in from a file
    if (!config.loadFromFile) {
      return;
    }
    console.log("loading data from", config.loadFromFile);

    path.exists(config.loadFromFile, function(exists) {
      if (exists) {
        var data = JSON.parse(fs.readFileSync(config.loadFromFile));
        UserStore.load(data.users);
        MessageStore.load(data.messages);
        CommentStore.load(data.comments);
      }
    });
  },

  addUser: function() {
    return UserStore.add();
  },

  getUserById: function(id) {
    return UserStore.getById(id);
  },

  getMessageById: function(id) {
    return MessageStore.getById(id);
  },

  getLastNMessages: function(n) {
    return MessageStore.getLastN(n);
  },

  getLastNMessagesExcludingUser: function(n, userId) {
    return MessageStore.getLastNExcludingUser(n, userId);
  }
};