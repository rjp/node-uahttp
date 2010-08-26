
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

var unsent_events = new Array;

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

Bot.prototype.close = function() {
    sys.puts("Wah, my stream closed");
    pending[this.name] = undefined; // no more ua
    live[this.name] = undefined; // no more ua
}

Bot.prototype.reply_user_logout = function(a) {
    sys.puts("someone logged out");
}
//<announce="message_add"><messageid=12/><folderid=1/><foldername="test"/><subject="cocks"/><fromid=3/><fromname="rjp"/><announcetime=1282814054/></>
Bot.prototype.announce_message_add = function(a) {
    this.flatten(a);
    announce = a["fromname"] + " posted ``"+a["subject"]+"'' in "+a["foldername"]
    unsent_events.push(announce)
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

function wipe_session(req, res) {
    req.session.regenerate(function(err){
        res.writeHead(302, { Location: '/' });
        res.end();
    });
}

function with_session(req, res, callback) {
    sn = req.session.name;
    if (sn) {
        ua = live[sn];
        sys.puts("session ok, ua="+ua);
        callback(res, req, ua);
    } else {
        sys.puts("no session, redirecting");
        wipe_session(req, res);
    }
    res.end();
}

function with_live_session(req, res, callback) {
    sn = req.session.name;
    if (sn) {
        ua = live[sn];
        if (ua) {
            sys.puts("live session ok");
            callback(res, req, ua);
            res.end();
        } else {
            sys.puts("no session, redirecting");
            wipe_session(req, res);
        }
    } else {
        sys.puts("no session, redirecting");
        wipe_session(req, res);
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
                jade.renderFile('welcome.html', {locals:{random: parseInt(Math.random()*10000000000), title:'Testing',name:req.session.name}}, function(err, html){
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
        res.end();
    });
    // will this serve static files?
    app.get('/static/*', staticFiles('.'));

    app.get('/live.json', function(req, res) {
        with_live_session(req, res, function(res, req, ua) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            a = { alive: 1, events: [] }
            for(i in unsent_events) {
                a.events.push(unsent_events[i]);
            }
            unsent_events = []
            sys.puts(JSON.stringify(a));
            res.write(JSON.stringify(a));
        });
        res.end();
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
