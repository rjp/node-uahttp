var clutch = require("clutch");

function checksession(uuid) {
    return "fish";
}

function helloSomeone(req, res, session, name) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello '+name+'!'+' SESSION='+session+'\n');
}

function helloWorld(req, res) {
    helloSomeone(req, res, 'World');
}

exports.urls = clutch.route404([['GET /ua/(.+)/(\\w+)/?$', helloSomeone],
                                ['GET /ua/?$', helloWorld]]);
