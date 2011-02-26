var socket = new io.Socket();

socket.on('connect', function() {
  console.log("Connected!");
});

socket.on('disconnect', function() {
  console.log("Disconnected...");
});


var messageHandlers = {
  dom: function(config) {
    var target = $(config.target);
    config.position = config.position || "append";
    switch (config.position) {
     case "append":
      target.append(config.content);
      break;
     case "prepend":
      target.prepend(config.content);
      break;
     case "replace":
      target.replaceWith(config.content);
      break;
    }
  }
};

socket.on('message', function(msg) {
  console.log("Got a message!", msg);
  messageHandlers[msg.method].apply(messageHandlers, msg.params);
});

socket.connect();