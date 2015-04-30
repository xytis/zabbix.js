"use strict";

var request = require("request");
var E = require("./errors");

var Client = function (url, user, password, logger) {
    this.url = url;
    this.user = user;
    this.password = password;
    this.rpcid = 0;
    this.authid = null;
    this.logger = logger || { debug: function(){}, error: console.error.bind(console) };
};

Client.prototype.errors = E;

Client.prototype.call = function call(method, params, callback) {
    var self = this;
    self.logger.debug({method: method, params: params}, "zabbix call");

    request({
        method: "POST",
        uri: this.url,
        headers: { "content-type": "application/json-rpc" },
        json: {
            jsonrpc : "2.0",
            id: ++this.rpcid,
            auth: this.authid,
            method: method,
            params: params
        }
    }, function (err, res, data) {
        if (err) {
            self.logger.error(err, "zabbix request error");
            return callback(err, data);
        }

        self.logger.debug({data: data, response_code: res.statusCode}, "zabbix response");
        if (res.statusCode === 200 && "undefined" !== typeof data) {
            if (data.error) {
                return callback(new E.ZabbixRPCError(data.error));
            }
            callback(null, data.result);
        } else if (res.statusCode === 412) {
            callback(new E.ZabbixError("Invalid parameters."));
        } else {
            // 1.9.6 just returns a empty response with Content-Length 0 if the method does not exist.
            // 2.x returns a proper response!
            if (self.apiversion === "1.2") {
                callback(new E.ZabbixError("That method does most likely not exist."), "Method missing!");
            } else {
                // If we get here something else is broken, we should look into this more and handle more special cases (in a general way).
                callback(new E.ZabbixError("Something else went wrong"));
            }

        }
    });
};

Client.prototype.discoverApiVersion = function discoverApiVersion(callback) {
    this.call("apiinfo.version", {}, function (err, result) {
        if (!err) {
            this.apiversion = result;
            this.logger.debug({version: this.apiversion}, "discovered zabbix api version");
        }
        callback(err, result);
    }.bind(this));
};

Client.prototype.authenticate = function authenticate(callback) {
    this.call("user.login", {
        "user": this.user,
        "password" : this.password
    }, function (err, result) {
        if (!err) {
            this.authid = result;
        }

        callback(err, result);
    }.bind(this));
};

Client.prototype.deauthenticate = function deauthenticate(callback) {
    this.call("user.logout", [], function (err, result) {
        if (!err) {
            this.authid = undefined;
            this.rpcid = 0;
        }

        callback(err, result);
    }.bind(this));
};


module.exports = Client;
