'use strict';

var Writable = require('stream').Writable,
    inherits = require('util').inherits,
    fs = require('fs'),
    net = require('net'),
    unix = require('unix-dgram');

function UnixSocket() {
    Writable.call(this);
    
    this.path = null;
    this.type = null;
    this.switched = false;
    this.currentMessage = null;
    this.socket = null;
    this.state = 'disconnected';
}
inherits(UnixSocket, Writable);

UnixSocket.parseArgs = function (/*path, opts*/) {
    var i = arguments.length, args = new Array(i);
    while (i--) { args[i] = arguments[i]; }
    
    var opts, path, callback;
    
    if (typeof args[args.length-1] === 'function') {
        callback = args.pop();
    }
    
    if (typeof args[0] === 'string') {
        path = args.shift();
    }
    
    if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        opts = args.shift();
    } else {
        opts = { };
    }
    
    this.path = opts.path || path;
    this.type = opts.type || 'tcp';
    
    return callback;
};
UnixSocket.prototype.connect = function (/*path, opts, callback*/) {
    var callback = UnixSocket.parseArgs.apply(this, arguments);
    
    var self = this;
    
    if (self.state !== 'disconnected') { throw new Error('Connect called while ' + self.state); }
    
    self.state = 'connecting';
    
    var onError, onConnect, onClose, openSocket, cleanup;
    
    onConnect = function () {
        self.state = 'connected';
        
        var shouldWrite = self.currentMessage !== null;
        
        if (callback) { callback(null, self); }
        else { self.emit('connect'); }
        
        if (shouldWrite) { self.writeMessage(); }
    };

    onError = function (err) {
        if (/\b91\b/.test(err.code) && !self.switched) {
            if (self.socket && self.socket.close) {
                self.socket.close();
            }
            
            self.switched = true;
            
            if (self.type === 'tcp') {
                self.type = 'dgram';
            } else {
                self.type = 'tcp';
            }
            
            openSocket();
        } else {
            if (callback) { callback(err); }
            else { self.emit('error', err); }
            
            self.destroy();
        }
    };
    
    onClose = function () {
        cleanup();
        self.state = 'disconnected';
    };
    
    cleanup = function () {
        if (self.socket) {
            self.socket.removeListener('error', onError);
            self.socket.removeListener('close', onClose);
            self.socket.removeListener('connect', onConnect);
            
            self.socket = null;
        }
        
        self.emit('close');
    };

    openSocket = function () {
        var socket;
        
        switch (self.type) {
            case 'tcp':
                socket = new net.Socket();
            break;
            
            case 'dgram':
                socket = unix.createSocket('unix_dgram');
                socket.on('congestion', function () {
                    self.congested = true;
                });
                socket.on('writable', function () {
                    self.congested = false;
                    self.writeMessage();
                });
            break;
        }

        self.socket = socket;
        
        socket.once('error', onError);
        socket.once('close', onClose);
        socket.once('connect', onConnect);
        
        socket.connect(self.path);
    };
    
    fs.stat(self.path, function (err, stats) {
        if (err) {
            self.emit('error', err);
            self.destroy();
        }
        
        openSocket();
    });
};

UnixSocket.prototype.destroy = function () {
    this.state = 'destroyed';
    this.end();
};
UnixSocket.prototype.end = function (cb) {
    var self = this;
    Writable.prototype.end.call(this, function () {
        if (!self.socket) { return cb(); }
        
        switch (self.type) {
            case 'dgram':
                self.socket.close();
                self.socket.emit('close');
                if (typeof cb === 'function') { cb(); }
            break;
            
            case 'tcp':
                self.socket.end(cb);
            break;
        }
    });
};
UnixSocket.prototype._write = function (buf, encoding, callback) {
    this.currentMessage = [buf, callback];
    if (this.state !== 'connected' || this.congested) { return; }
    this.writeMessage();
};
UnixSocket.prototype.writeMessage = function () {
    var self = this,
        buf = self.currentMessage[0];
    
    var onWrite = function (err) {
        var callback = self.currentMessage[1];
        self.currentMessage = null;
        callback();
    };

    self.socket[self.type === 'dgram' ? 'send' : 'write'](buf, onWrite);
};

module.exports = UnixSocket;