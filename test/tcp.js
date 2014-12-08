'use strict';

var Promise = require('bluebird');

var net = require('net'),
    fs = require('fs');
    
var UnixSocket = require('../index');

Promise.promisifyAll(fs, { suffix: '$' });
Promise.promisifyAll(net.Socket.prototype, { suffix: '$' });
Promise.promisifyAll(UnixSocket.prototype, { suffix: '$' });

require('should-eventually');

var TEST_SOCKET = '/tmp/socket-test';

describe('tcp sockets', function () {
    var server;
    
    function getServer(onMessage) {
        var server;
        
        return fs.unlink$(TEST_SOCKET)
        .catch(function (e) { if (e.cause.code !== 'ENOENT') { throw e; } })
        .then(function () {
            server = net.createServer();
            server.on('connection', function (socket) {
                socket.on('data', onMessage);
            });
            Promise.promisifyAll(server, { suffix: '$' });
            return server.listen(TEST_SOCKET);
        })
        .disposer(function () {
            return server.close$()
            .then(function () {
                return fs.unlink$(TEST_SOCKET)
                .catch(function (e) { if (e.cause.code !== 'ENOENT') { throw e; } });
            });
        });
    }
    
    it('should connect, pass a message, and quit gracefully', function () {
        var count = 0;
        var deferred = Promise.defer();
        var server = getServer(function (buf) {
            count++;
            deferred.resolve(buf.toString());
        });
        
        return Promise.using(server, function () {
            var socket = new UnixSocket(TEST_SOCKET, { type: 'tcp' });
            return socket.connect$()
            .then(function () {
                return socket.write$('foo');
            })
            .then(function () {
                return socket.end$();
            })
            .then(function () {
                return deferred.promise.should.eventually.equal('foo');
            });
        }).then(function () {
            count.should.equal(1);
        });
    });
    
    it('should switch to tcp for tcp sockets opened as datagram sockets', function () {
        var count = 0;
        var deferred = Promise.defer();
        var server = getServer(function (buf) {
            count++;
            deferred.resolve(buf.toString());
        });
        
        return Promise.using(server, function () {
            var socket = new UnixSocket(TEST_SOCKET, { type: 'dgram' });
            return socket.connect$()
            .then(function () {
                return socket.write$('foo');
            })
            .then(function () {
                return socket.end$();
            })
            .then(function () {
                return deferred.promise.should.eventually.equal('foo');
            });
        }).then(function () {
            count.should.equal(1);
        });
    });
    
});

