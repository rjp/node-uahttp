
/**
 * Module dependencies.
 */

var erb = require("asyncEJS");
var jade = require('jade');
var sys = require('sys'),
    staticFiles = require('connect/middleware/staticProvider'),
    MemoryStore = require('connect/middleware/session/memory'),
    connect = require('connect');
var uaclient = require('uaclient');
var live = new Array;
var pending = new Array;

// our UAClient subclass
function Bot(name) {
    uaclient.UAClient.call(this);
    var self = this;
    this.name = name;
}
sys.inherits(Bot, uaclient.UAClient);
Bot.prototype.reply_user_login = function(a) {
    sys.puts("do something with the connection here = "+this.name);
    live[this.name] = pending[this.name];
    pending[this.name] = undefined;

//    <request="folder_list"><searchtype=2/></>
    live[this.name].stream.write('<request="folder_list"><searchtype=2/></>');
}

Bot.prototype.reply_folder_list = function(a) {
    var i;
    // <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><temp=1/><unread=1/></><numfolders=1/></>
    sys.puts(a.children.length);
    for(i=0; i<a.children.length; i++) {
        sys.puts(i+" "+a.children[i].tag);
        f = a.children[i];
        if (f.tag == 'folder') {
	        this.flatten(f);
            if (f["subtype"] == 1) { // subscribed
		        if (f["unread"]) {
		            sys.print("U "+f["name"]+" "+f["unread"]);
		        } else {
		            sys.print("N "+f["name"]);
		        }
            } else {
		        if (f["unread"]) {
		            sys.print("u "+f["name"]+" "+f["unread"]);
		        } else {
		            sys.print("n "+f["name"]);
		        }
            }
        }
    }
}

// end

function with_live_session(req, res, callback) {
    sn = req.session.name;
    if (sn) {
        ua = live[sn];
        if (ua) {
            callback(res, req, ua);
        } else {
            res.writeHead(302, { Location: '/' });
            res.end();
        }
    }
}


// One minute
var minute = 60000;

// Setup memory store
var memory = new MemoryStore({ reapInterval: minute, maxAge: minute * 100000 });

var server = connect.createServer(
    connect.logger({ format: ':method :url' }),
    connect.bodyDecoder(),
    connect.cookieDecoder(),
    connect.session({ store: memory, secret: 'foobar' }),
    connect.router(app),
    connect.errorHandler({ dumpExceptions: true, showStack: true })
);

server.listen(3000);
console.log('Connect server listening on port 3000');

function app(app) {
    app.get('/', function(req, res){
        res.writeHead(200, { 'Content-Type': 'text/html' });
         var x = "";
        // Fetch number of "online" users
        req.sessionStore.length(function(err, n){
            // User joined
            if (req.session.name) {
                jade.renderFile('welcome.html', {locals:{title:'Testing',name:req.session.name}}, function(err, html){
                    res.end(html);
                 });
            } else {
                jade.renderFile('nosession.html', {locals:{title:'Testing'}}, function(err, html){
                    res.end(html);
                 });
            }
        });
    });
    app.get('/page', function(req, res){
        if (req.session.name) {
            ua = live[req.session.name];
            if (ua) {
                ua.page(3, "UA HTTP IS ALIVE!");
            }
            res.writeHead(302, { Location: '/' });
            res.end();
        }
    });

    app.get('/logout', function(req, res){
        req.session.regenerate(function(err){
            res.writeHead(302, { Location: '/' });
            res.end();
        });
    });
    // JSON for the AJAX folder list
    app.get('/folders.json', function(req, res){
        with_live_session(req, res, function(res, req, ua) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.write('{"name":"test","unread":2,"sub":1}');
        });
    });
    // will this serve static files?
    app.get('/static/app.js', staticFiles('.'));

    app.get('/live.json', function(req, res) {
	    res.writeHead(200, { 'Content-Type': 'application/json' });
	    sn = req.session.name;
	    if (sn) {
	        ua = live[sn];
	        if (ua) {
	            res.write('{ok:1, alive:1}');
	        } else {
	            res.write('{ok:1, alive:0}');
	        }
	    }
    });


    app.post('/login', function(req, res){
        switch (req.body.op) {
            case 'Join':
                req.session.regenerate(function(err){
                    var name = req.session.name = req.body.name;
                    pending[name] = new Bot(name);
                    pending[name].connect(req.body.name,req.body.password);
                    sys.puts("connecting "+req.body.name+"/"+req.body.password);
                    res.writeHead(302, { Location: '/' });
                    res.end();
                });
                break;
        }
    });
}
