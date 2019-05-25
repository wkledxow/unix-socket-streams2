'use strict';

require('should');

var Promise = require('bluebird');

var net = require('net'),
    fs = require('fs');

var UnixSocket = require('../index');

Promise.promisifyAll(fs, { suffix: '$' });
Promise.promisifyAll(net.Socket.prototype, { suffix: '$' });
Promise.promisifyAll(UnixSocket.prototype, { suffix: '$' });

var TEST_SOCKET = '/tmp/socket-test';

function defer() {
    var deferred = { };
    deferred.promise = new Promise(function (resolve, reject) {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });
    return deferred;
}

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
        var deferred = defer();
        var server = getServer(function (buf) {
            count++;
            deferred.resolve(buf.toString());
        });

        return Promise.using(server, function () {
            var socket = new UnixSocket();

            return socket.connect$(TEST_SOCKET, { type: 'tcp' })
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

    it('should emit a \'close\' event', function () {
        var deferred = defer();
        var server = getServer(function () { });

        return Promise.using(server, function () {
            var socket = new UnixSocket();

            return socket.connect$(TEST_SOCKET, { type: 'dgram' })
            .then(function () {
                socket.once('close', deferred.resolve.bind(deferred));
                socket.end();
                return deferred.promise;
            });
        });
    });

    it('should switch to tcp for tcp sockets opened as datagram sockets', function () {
        var count = 0;
        var deferred = defer();
        var server = getServer(function (buf) {
            count++;
            deferred.resolve(buf.toString());
        });

        return Promise.using(server, function () {
            var socket = new UnixSocket();

            return socket.connect$(TEST_SOCKET, { type: 'dgram' })
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

