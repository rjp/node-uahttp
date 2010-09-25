
/**
 * Module dependencies.
 */

var jade = require('jade');
var sys = require('sys'),
    staticFiles = require('connect/middleware/staticProvider'),
    MemoryStore = require('connect/middleware/session/memory'),
    connect = require('connect');
var uaclient = require('uaclient');
var live = new Array;
var pending = new Array;

var unsent_events = new Array;

function reply_folder_list(a) {
    var i;
    // <reply="folder_list"><folder=1><name="test"/><accessmode=7/><subtype=1/><temp=1/><unread=1/></><numfolders=1/></>
    sys.puts("folder list received "+ a.children.length);
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

// our UAClient subclass
function Bot(name) {
    uaclient.UAClient.call(this);
    var self = this;
    this.name = name;

    // if we log in successfully, remember our "handle"
    this.addListener("reply_user_login", function(a) {
	    sys.puts("do something with the connection here = "+this.name);
	    live[this.name] = pending[this.name];
	    pending[this.name] = undefined;
	
	//    <request="folder_list"><searchtype=2/></>
        sys.puts("requesting our subscribed folder list");
	    live[this.name].stream.write('<request="folder_list"><searchtype=2/></>');
	});

    // if UA goes away, we need to delete our handle
    this.addListener("close", function(a) {
	    sys.puts("Wah, my stream closed");
	    pending[this.name] = undefined; // no more ua
	    live[this.name] = undefined; // no more ua
    });
    
    // we want to capture newly posted messages for displaying
    this.addListener("announce_message_add", function(a) {
	    this.flatten(a);
	    announce = a["fromname"] + " posted ``"+a["subject"]+"'' in "+a["foldername"]
	    unsent_events.push(announce)
	});

    this.addListener("reply_folder_list", reply_folder_list);
}
sys.inherits(Bot, uaclient.UAClient);

// end

function wipe_session(req, res) {
    req.session.regenerate(function(err){
        res.writeHead(302, { Location: '/' });
        res.end();
    });
}

function with_session(req, res, callback) {
    sn = req.session.name;
    sys.puts("ws: checking "+sn);
    if (sn) {
        ua = live[sn];
        sys.puts("ws: session ok, ua="+ua);
        callback(res, req, ua);
    } else {
        sys.puts("ws: no session, redirecting");
        wipe_session(req, res);
    }
}

function with_live_session(req, res, callback, error) {
    sn = req.session.name;
    sys.puts("SN="+sn);
    if (sn) {
        ua = live[sn];
        if (ua) {
            sys.puts("wls: live session ok for "+sn);
            callback(res, req, ua);
            res.end();
        } else {
            sys.puts("wls: no live session for "+sn+", redirecting");
            wipe_session(req, res);
        }
    } else {
        sys.puts("wls: no session for "+sn+", redirecting");
        if (error != undefined) {
            error(req, res);
        } else {
            wipe_session(req, res);
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

function extend(v1, v2) {
    for (var property in v2)
        v1[property] = v2[property];
    return v1;
}

function render(template, locals, res, req) {
    var my_locals = { 
        random: parseInt(Math.random()*10000000000),
        title: "DEFAULT TITLE",
        name: req.session.name,
        template: template
    };
    extend(my_locals, locals);
    sys.puts(JSON.stringify(my_locals));
    jade.renderFile(template, { locals: my_locals }, function(err, html) {
        if (err) {
            sys.puts(err);
        }
        sys.puts(html)
        res.end(html);
    });
}

function app(app) {
    app.get('/pending', function(req, res){
        // we need a session but we won't have a live one yet
        with_session(req, res, function(res, req, ua) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            render('pending.html', {title:'Logging in'}, res, req);
        });
    });

    app.get('/ua', function(req, res){
        with_session(req, res, function(res, req, ua) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            render('welcome.html', {title:'Logging in'}, res, req);
        });
    });

    app.get('/', function(req, res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        render('nosession.html', {title:'Testing'}, res, req);
    });

    app.post('/page', function(req, res){
        with_live_session(req, res, function(res, req, ua) {
            sys.puts("paging "+req.body.to+" with ["+req.body.text+"]");
            ua.page(3, req.body.text);
        });
    });

    app.get('/logout', function(req, res){
        with_live_session(req, res, function(res, req, ua) {
            ua.stream.write('<request="user_logout"/>');
        });
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
        }, function(req, res) {
            req.session.regenerate(function(err){
	            res.writeHead(200, { 'Content-Type': 'application/json' });
	            a = { alive: 0 };
	            sys.puts("NOT ALIVE IN /live.json : " + JSON.stringify(a));
	            res.write(JSON.stringify(a));
            })
        });
        res.end();
    });

    app.get('/pending.json', function(req, res) {
        with_session(req, res, function(res, req, ua) {
            var a;
            var name = req.session.name;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (live[name]) {
                a = { alive: 1 };
            } else if (pending[name]) {
                a = { pending: 1 };
            } else {
                a = { login: 1 };
            }
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
                    sys.puts("connecting "+req.body.name+"/"+req.body.password+", session name is "+name+", bot="+pending[name]);
                    res.writeHead(302, { Location: '/pending' });
                    res.end();
                });
                break;
        }
    });
}
