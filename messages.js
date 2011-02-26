var uuid = require('node-uuid'),
    util = require('util');

var MessageStore = {
  _messages: {},
  _messagesInTime: [],

  add: function(userId, content) {
    var m = new Message(userId, content);
    this._messages[m.id] = m;
    this._messagesInTime.push(m.id);
    return m;
  },

  getById: function(id) {
    return this._messages[id];
  },

  getLastN: function(n) {
    var size = this._messagesInTime.length;
    var messages = [];
    n = Math.min(n, size);
    while (n--) {
      messages.unshift(this.getById(this._messagesInTime[size - 1 - n]));
    }
    return messages;
  },

  getLastNExcludingUser: function(n, userId) {
    var messages = [];
    var index = this._messagesInTime.length;
    while (messages.length < n && --index >= 0) {
      var message = this.getById(this._messagesInTime[index]);
      console.log("Got message at index",index, ":", util.inspect(message));
      if (message.userId !== userId) {
        messages.push(message);
      }
    }
    return messages;
  }
};

var UserStore = {
  _users: {},

  add: function() {
    var user = new User();
    this._users[user.id] = user;
    return user.id;
  },

  getById: function(id) {
    return this._users[id];
  }
};

var CommentStore = {
  _comments: {},

  add: function(userId, messageId, content) {
    var comment = new Comment(userId, messageId, content);
    this._comments[comment.id] = comment;
    return comment.id;
  },

  getById: function(id) {
    return this._comments[id];
  }

};

function Comment(userId, messageId, content) {
  this.id = uuid();
  this.timestamp = new Date().getTime();
  this.userId = userId;
  this.messageId = messageId;
  this.content = content;
};

Comment.prototype = {
  getUser: function() {
    UserStore.getById(this.userId);
  },
  getMessage: function() {
    MessageStore.getById(this.messageId);
  }
};

function Message(userId, content) {
  this.id = uuid();
  this.timestamp = new Date().getTime();
  this.userId = userId;
  this.content = content;
  this.commentIds = [];
}

Message.prototype = {
  getUser: function() {
    UserStore.getById(this.userId);
  },

  addComment: function(userId, content) {
    var commentId = CommentStore.add(userId, this.id, content);
    this.commentIds.push(commentId);
    return commentId;
  },

  getComments: function() {
    var comments = [];
    for (var i = 0; i < this.commentIds.length; i++) {
      comments.push(CommentStore.getById(this.commentIds[i]));
    }
    return comments;
  }
};


function User() {
  this.id = uuid();
  this._messageIds = [];
}

User.prototype = {
  add: function(content) {
    var m = MessageStore.add(this.id, content);
    this._messageIds.push(m.id);
    return m.id;
  },

  getMessages: function() {
    var messages = [];
    for (var i = 0; i < this._messageIds.length; i++) {
      messages.unshift(MessageStore.getById(this._messageIds[i]));
    }
    return messages;
  }
};

module.exports = {

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