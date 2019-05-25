'use strict';

require('should');

var Promise = require('bluebird');

var unix = require('unix-dgram'),
    fs = require('fs');

var UnixSocket = require('../index');

Promise.promisifyAll(fs, { suffix: '$' });
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

describe('datagram sockets', function () {
    function getServer(onMessage) {
        var server;

        return fs.unlink$(TEST_SOCKET)
        .catch(function (e) { if (e.cause.code !== 'ENOENT') { throw e; } })
        .then(function () {
            server = unix.createSocket('unix_dgram', onMessage);
            return server.bind(TEST_SOCKET);
        })
        .disposer(function () {
            server.close()

            return fs.unlink$(TEST_SOCKET)
            .catch(function (e) { if (e.cause.code !== 'ENOENT') { throw e; } });
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

    it('should support node-unix-datagram\'s congestion control', function () {
        var count = 0;
        var deferred = defer(),
            deferred2 = defer();

        var server = getServer(function (buf) {
            count++;
            if (count === 1) { deferred.resolve(buf.toString()); }
            if (count === 2) { deferred2.resolve(buf.toString()); }
        });

        return Promise.using(server, function () {
            var socket = new UnixSocket();

            return socket.connect$(TEST_SOCKET, { type: 'dgram' })
            .then(function () {
                return socket.write$('foo');
            })
            .then(function () {
                socket.socket.emit('congestion');
                socket.write('bar');
                return deferred.promise.should.eventually.equal('foo');
            })
            .then(function () {
                socket.socket.emit('writable');
                return deferred2.promise.should.eventually.equal('bar');
            }).then(function () {
                return socket.end$();
            })
        }).then(function () {
            count.should.equal(2);
        });
    });

    it('should switch to datagram for datagram sockets opened as tcp', function () {
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

    it('should not double-emit \'close\' when switching from tcp to udp', function () {
        var count = 0;
        var deferred = defer();
        var server = getServer(function (buf) {
            count++;
            deferred.resolve(buf.toString());
        });
        var closed = 0;

        return Promise.using(server, function () {
            var socket = new UnixSocket();

            socket.on('close', function () { closed++; });

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
            closed.should.equal(1);
        });
    });
});

