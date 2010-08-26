var all_events = new Array;

function show_alive(data, textStatus) {
    $('#alive').html(data.alive);
    if (! data.alive) { // no live UA connection
        window.location('/');
    }
    if (data.alive) { // live session
        $.getJSON('/folders.json', show_folders);
        a = ""
        for(i in data.events) {
            all_events.push(data.events[i]);
        }
        for(i in all_events) {
            a = a + "<li>" + all_events[i];
        }
        $('ul#events').html(a);
    }
}

function show_folders(data, textStatus) {
    $('ul#folders').html('<li>NO FOLDERS? '+new Date);
}

function check_alive() {
    $.getJSON('/live.json', show_alive);
}

$(document).ready(function(){
    check_alive();
    setInterval("check_alive()", 15000);
});
