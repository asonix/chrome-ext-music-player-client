// Written by Mike Frysinger <vapier@gmail.com>.  Released into the public domain.  Suck it.

/* Globals to allow easy manipulation via javascript console */
var mpc;
var tcpclient;
var refresh_id = NaN;

function TcpClientSender(tcpclient) {
  this.tcpclient = tcpclient;
}
TcpClientSender.prototype.send = function(data, cb) {
  this.tcpclient.sendMessage(data, cb);
}
TcpClientSender.prototype.poll = function() {
  this.tcpclient.poll();
}
TcpClientSender.prototype.reconnect = function() {
  this.tcpclient.disconnect();
  this.tcpclient.connect();
}

function tramp_mpc_recv(data) {
  mpc.recv(data);
}

function sync_storage(sync) {
  return sync ? chrome.storage.sync : chrome.storage.local;
}

window.onload = function() {
  var local_keys = [
    'sync',
  ];
  var sync_keys = [
    'host', 'port', 'refresh',
    ];
  var options = {
    'host': '192.168.0.2',
    'port': 6600,
    'sync': true,
    'refresh': .5,
  };

  chrome.storage.local.get(local_keys, function(settings) {
    local_keys.forEach(function(key) {
      if (key in settings)
      options[key] = settings[key]
    });

    var storage = sync_storage(options['sync']);
    storage.get(sync_keys, function(settings) {
      sync_keys.forEach(function(key) {
        if (key in settings)
        options[key] = settings[key];
      });

      init_ui(local_keys, sync_keys, options);
      mpc_connect();
    });
  });
};

window.onkeypress = function(e) {
  if (e.target != document.body) {
    /* Only allow the shortcuts when the focus is on the body.
       Otherwise you can't type these numbers into text fields. */
    return;
  }

  switch (e.keyCode) {
    case 49: // 1
      show_page('controls');
      break;
  }
};

function mpc_refresh() {
  mpc.status();
}

function mpc_connect(host, port) {
  if (typeof(host) != 'string') {
    host = window['opts_host'].value;
    port = parseInt(window['opts_port'].value);
  }

  if (mpc != undefined) {
    console.log('disconnecting');
    update_ui('disconnect');
    delete mpc;
    tcpclient.disconnect();
    delete tcpclient;
  }

  update_ui('init');
  tcpclient = new TcpClient(host, port);
  tcpclient.connect(function(resultCode) {
    if (resultCode < 0) {
      update_ui('error', resultCode);
      return;
    }

    var mpc_sender = new TcpClientSender(tcpclient);
    tcpclient.addResponseListener(tramp_mpc_recv);
    mpc = new Mpc(mpc_sender, update_ui);
    console.log('connected to ' + host + ':' + port);
    console.log('protip: use the "mpc" object to poke mpd directly.\n' +
      'you can also do mpc.set_debug(3) to see traffic');
    mpc_refresh();
    update_refresh_timer();
  });
}

function tramp_mpc_consume() {
  var val = zo(!getToggleButton(this));
  mpc.consume(val);
  setToggleButton(this, val);
}
function tramp_mpc_deleteid() { mpc.deleteid(this.title); }
function tramp_mpc_next() { mpc.next(); mpc.currentsong(); hide_on_status_change ('play'); }
function tramp_mpc_pause() { mpc.pause(); hide_on_status_change ('pause'); }
function tramp_mpc_play() { mpc.play(); mpc.currentsong(); hide_on_status_change ('play'); }
function tramp_mpc_previous() { mpc.previous(); mpc.currentsong(); hide_on_status_change ('play'); }
function tramp_mpc_random() {
  var val = zo(!getToggleButton(this));
  mpc.random(val);
  setToggleButton(this, val);
}
function tramp_mpc_repeat() {
  var val = zo(!getToggleButton(this));
  mpc.repeat(val);
  setToggleButton(this, val);
}
function tramp_mpc_seekcur() { mpc.seekcur(this.value); }
function tramp_mpc_setvol() { mpc.setvol(this.value); }
function tramp_mpc_single() {
  var val = zo(!getToggleButton(this));
  mpc.single(val);
  setToggleButton(this, val);
}
function tramp_mpc_stop() { mpc.stop(); hide_on_status_change ('stop'); }

function zo(val) {
  return val ? 1 : 0;
}
function szo(val) {
  return val == '0' ? 0 : 1;
}
function getToggleButton(btn) {
  return btn.className == 'on';
}
function setToggleButton(btn, val) {
  if (val === undefined)
    val = !getToggleButton(btn);
  btn.className = val ? 'on' : 'off';
}

function show_page(page) {
  if (typeof(page) != 'string')
    page = this.id.split('.')[1];

  // We might not be connected in which case 'mpc' will be undefined.
  switch (page) {
    case 'controls':
      if (mpc)
        mpc.playlistinfo();
        mpc.currentsong();
      break;
  }

  var eles = document.getElementsByClassName('main');
  for (var i = 0; i < eles.length; ++i) {
    var ele = eles[i];
    var dis = 'none';
    var cls = '';
    if (ele.id == 'main.' + page) {
      dis = '';
      cls = 'selected';
    }
    ele.style.display = dis;
    document.getElementById('tab.' + ele.id.split('.')[1]).className = cls;
  }
}

function do_refresh() {
  mpc_refresh();
  refresh_id = window.setTimeout(do_refresh, window['opts_refresh'].value * 1000);
}

function update_refresh_timer() {
  if (!isNaN(refresh_id))
    window.clearTimeout(refresh_id);
  var rate = window['opts_refresh'].value * 1000;
  if (rate > 0)
    refresh_id = window.setTimeout(do_refresh, rate);
}

function update_local_settings() {
  var setting = {};
  setting[this.id] = this.checked;
  chrome.storage.local.set(setting);
}

function update_sync_settings() {
  var setting = {};
  setting[this.id] = this.value;
  var storage = sync_storage(window['opts_sync'].checked);
  storage.set(setting);

  switch (this.id) {
    case 'refresh':
      update_refresh_timer();
      break;
  }
}

function init_ui(local_keys, sync_keys, options) {
  var ele, i;

  /* Setup footer */
  i = 1;
  [
    'controls',
    ].forEach(function(id) {
      var ele = document.getElementById('tab.' + id);
      ele.onclick = show_page;
      ele.title = id + ' [' + i + ']';
      ++i;
    });

  /* Setup controls */
  ui_mpc_status = document.getElementById('status');
  [
    'consume', 'next', 'pause', 'play', 'previous', 'random', 'repeat',
    'seekcur', 'setvol', 'single', 'stop',
    ].forEach(function(id) {
      var ele = window['ui_mpc_' + id] = document.getElementById(id);
      ele.onchange = ele.onclick = window['tramp_mpc_' + id];
      ele.title = id;
      if (ele.accessKey)
      ele.title += ' [' + ele.accessKey + ']'
    });
  window['ui_mpc_currtime1'] = document.getElementById('currtime1');
  window['ui_mpc_currtime2'] = document.getElementById('currtime2');

  /* Setup metadata */
  [
    'album', 'artist', 'date', 'file', 'title',
    ].forEach(function(id) {
      window['ui_mpc_metadata_' + id] = document.getElementById('metadata.' + id);
    });

  /* Setup playlist */
  window['ui_mpc_playlist'] = document.getElementById('playlist');

  /* Setup options tab */
  document.getElementById('connect').onclick = mpc_connect;
  local_keys.forEach(function(id) {
    var ele = window['opts_' + id] = document.getElementById(id);
    ele.checked = options[id];
    ele.onchange = update_local_settings;
  });
  sync_keys.forEach(function(id) {
    var ele = window['opts_' + id] = document.getElementById(id);
    ele.value = options[id];
    ele.oninput = update_sync_settings;
  });
}

function pretty_time(time) {
  var sec, min, hrs, ret = '';
  time = parseInt(time);
  sec = time % 60;
  min = parseInt((time / 60) % 60);
  hrs = parseInt((time / 3600) % 3600);
  if (hrs)
    ret = hrs + ':' + ("00" + min).substr(-2) + ':';
  else
    ret = min + ':';
  return ret + ("00" + sec).substr(-2);
}

function playlist_del() {
  mpc.deleteid(this.song_id);
  this.parentNode.remove();
}

function playlist_play() {
  mpc.playid(this.parentNode.childNodes[1].song_id);
  mpc.currentsong(); 
  hide_on_status_change ('play');
  for (var i = 0; i < this.parentNode.parentNode.childNodes.length; ++i) {
    this.parentNode.parentNode.childNodes[i].className = '';
  }
  this.parentNode.className = 'bold';
}

function update_ui(state, cmd) {
  if (typeof(state) == 'string') {
    ui_mpc_status.innerText = ({
      'disconnect': 'Disconnecting...',
      'init': 'Connecting...',
      'error': 'Connection error ' + cmd,
    })[state];
    return;
  }

  if (Array.isArray(state)) {
    /*
       switch (cmd[0]) {
       case 'setvol':
       case 'seekcur':
       break;
       default:
       mpc_refresh();
       }
       */
    return;
  }

  /* Update the metadata tab only when things have changed. */
  var currentsong;
  if ('Currentsong' in state) {
    currentsong = state.Currentsong;
    if (window['current_song'] != currentsong) {
      // if (ui_mpc_metadata_file.lastUpdate != state.Currentsong.lastUpdate) {
        // ui_mpc_metadata_album.innerText = currentsong.Album;
        // ui_mpc_metadata_artist.innerText = currentsong.Artist;
        // ui_mpc_metadata_title.innerText = currentsong.Title;
        // ui_mpc_metadata_date.innerText = currentsong.Date;
        // ui_mpc_metadata_file.innerText = currentsong.file;
        for (var i = 0; i < ui_mpc_playlist.childNodes[0].childNodes.length; ++i) {
          if (ui_mpc_playlist.childNodes[0].childNodes[i].childNodes[0].song_id == currentsong.Id) {
            for (var j = 0; j < ui_mpc_playlist.childNodes[0].childNodes.length; ++j) {
              ui_mpc_playlist.childNodes[0].childNodes[j].className = '';
            }
            ui_mpc_playlist.childNodes[0].childNodes[i].className = "bold";
            // ui_mpc_playlist.parentNode.scrollTop = ui_mpc_playlist.childNodes[0].childNodes[i].offsetTop - 0.5 * ui_mpc_playlist.parentNode.clientHeight;
            scrollToTop(ui_mpc_playlist.parentNode, ui_mpc_playlist.childNodes[0].childNodes[i].offsetTop - 0.5 * ui_mpc_playlist.parentNode.clientHeight, 300)
          }
        }
        document.title = currentsong.Title + " by " + currentsong.Artist + " on " + currentsong.Album;
        window['current_song'] = currentsong;
      // }
    }
  }

  /* Update the playlist tab only when things have changed. */
  if ('Playlist' in state && ui_mpc_playlist.lastUpdate != state.Playlist.lastUpdate) {
    var playlist = state.Playlist;

    ui_mpc_playlist.innerHTML = '';
    playlist.forEach(function(song) {
      var cell, row = ui_mpc_playlist.insertRow(-1);
      if (currentsong && song.Pos == currentsong.Pos)
      row.className = 'bold';

    cell = row.insertCell(-1);
    cell.id = 'playlist_del';
    cell.innerHTML = '&#164;';
    cell.song_id = song.Id;
    cell.title = 'delete';
    cell.onclick = playlist_del;

    cell = row.insertCell(-1);
    cell.innerText = song.Pos;
    cell.style.textAlign = 'right';
    cell.song_id = song.Id;
    cell.title = 'play';
    cell.onclick = playlist_play;

    if ('Artist' in song) {
      cell = row.insertCell(-1);
      cell.innerText = song.Title;
      cell.onclick = playlist_play;
      cell = row.insertCell(-1);
      cell.innerText = song.Artist;
      cell.onclick = playlist_play;
      cell = row.insertCell(-1);
      cell.innerText = song.Album;
      cell.onclick = playlist_play;
    } else {
      cell = row.insertCell(-1);
      cell.onclick = playlist_play;
      cell.innerText = song.file;
      cell.colSpan = 3;
    }
    cell = row.insertCell(-1);
    cell.innerText = pretty_time(song.Time);
    cell.onclick = playlist_play;
    });

    ui_mpc_playlist.lastUpdate = playlist.lastUpdate;
  }

  /* Update the status tab. */
  var time, percent;
  if ('time' in state) {
    // When stopped, there is no time field at all.
    time = state.time.split(':');
    percent = Math.floor((0.0 + time[0]) * 100 / (0.0 + time[1]));
  } else {
    time = [0, 0];
    percent = 0;
  }
  ui_mpc_seekcur.max = time[1];
  ui_mpc_seekcur.value = time[0];
  ui_mpc_seekcur.title = 'seekcur (' + percent + '%)';
  //ui_mpc_currtime.innerText = [pretty_time(time[0]), pretty_time(time[1]), percent + '%'].join(' / ');
  ui_mpc_currtime1.innerText = pretty_time(time[0]);
  ui_mpc_currtime2.innerText = pretty_time(time[1]);

  ui_mpc_setvol.title = 'setvol';
  if ('volume' in state) {
    ui_mpc_setvol.value = state.volume;
    ui_mpc_setvol.title += ' (' + state.volume + '%)';
  }

  [
    'consume', 'random', 'repeat', 'single',
    ].forEach(function(id) {
      setToggleButton(window['ui_mpc_' + id], szo(state[id]));
    });

  ui_mpc_status.innerText = ({
    'play': 'Playing',
    'pause': 'Paused',
    'stop': 'Stopped',
  })[state.state];
}


function hide_on_status_change (action) {
  var pause1 = document.getElementById ('pause');
  var play1 = document.getElementById ('play');
  var stop1 = document.getElementById ('stop');
  if (action == "play") {
    play1.className = "hiding";
    stop1.className = "showing";
    pause1.className = "showing";
  } else if (action == "pause") {
    play1.className = "showing";
    stop1.className = "showing";
    pause1.className = "hiding";
  } else if (action == "stop") {
    play1.className = "showing";
    stop1.className = "hiding";
    pause1.className = "showing";
    }
}

function scrollToTop(element, to, duration) {
    if (duration <=    0) return;
    var difference = to - element.scrollTop;
    var perTick = difference / duration * 10;

    setTimeout(function () {
        element.scrollTop = element.scrollTop + perTick;
        scrollToTop(element, to, duration - 10);
    }, 10);
}