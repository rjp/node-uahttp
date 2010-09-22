function show_alive(data, textStatus) {
    $('#alive').html(data.alive);
    if (data.alive) { // live session
        window.location = '/ua';
    }
}

function check_alive() {
    $.getJSON('/pending.json', show_alive);
}

$(document).ready(function(){
    check_alive();
    setInterval("check_alive()", 5000);
});
