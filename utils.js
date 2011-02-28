var underscore = require('underscore');

module.exports = {
  /**
   * for use with futures.join, this will extract the success arguments
   */
  args: function(cb, context) {
    return function() {
      var args = underscore.toArray(arguments);
      var results = [];
      for (var i = 0; i < args.length; i++) {
        var err = args[i][0];
        var param = args[i][1];
        results.push(err ? null : param);
      }
      cb.apply(context, results);
    };
  }
};