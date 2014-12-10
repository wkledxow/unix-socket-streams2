# Unix-Socket-Streams2
This is a small helper library that accomplishes a few purposes for more easily dealing with unix domain sockets.

- It supports both tcp (streaming) and udp (datagram) modes, and will attempt to switch to the appropriate mode if you open the socket in the wrong mode and/or simply don't know
- It wraps the library node-unix-datagram in a "proper" Node streams2 stream, including incorporating that module's congestion control mechanism

That's really all there is to it.

### Install

    npm install unix-socket-streams2

### Use

    var UnixStream = require('unix-socket-streams2');
	var socket = new UnixStream();
    socket.connect('/path/to/socket', function (err, stream) { });

### Api

#### UnixStream#connect

	socket.connect(path, opts callback);

You may specify the type of socket to initially attempt to connect as like so:

    var socket = new UnixStream('/path/to/socket', { type: 'tcp' });

Valid options are 'tcp' and 'dgram'


#### UnixStream#end

	socket.end(callback);

#### UnixStream#write

	socket.write(callback);

### Test

    git clone https://github.com/myndzi/unix-socket-streams2
    cd unix-socket-streams2
    npm test