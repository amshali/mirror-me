// Function for selecting a range in an input box.
$.fn.selectRange = function(start, end) {
  // I don't know why... but $(this) don't want to work today :-/
  var e = document.getElementById($(this).attr('id'));
  if (!e) return;
  else if (e.setSelectionRange) {
    e.focus();
    e.setSelectionRange(start, end);
  } /* WebKit */
  else if (e.createTextRange) {
    var range = e.createTextRange();
    range.collapse(true);
    range.moveEnd('character', end);
    range.moveStart('character', start);
    range.select();
  } /* IE */
  else if (e.selectionStart) {
    e.selectionStart = start;
    e.selectionEnd = end;
  }
};

function joinPath(a, b) {
  var p1 = a;
  var p2 = b;
  if (!a.endsWith('/')) {
    p1 = a + '/';
  }
  if (b.startsWith('/')) {
    p2 = b.substring(1);
  }
  return p1 + p2;
}

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, "\\$&");
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function getFileNameDir(path) {
  var lastSlash = path.lastIndexOf('/');
  return {
    FileName: path.substring(lastSlash + 1),
    FileDir: path.substring(0, lastSlash + 1)
  };
}

function detectMode(filename) {
  var info = CodeMirror.findModeByFileName(filename);
  var mode, spec;
  if (info) {
    mode = info.mode;
    spec = info.mime;
    if (spec === 'text/x-csrc') {
      spec = 'text/x-c++src';
    }
  } else {
    mode = null;
    spec = 'text/plain';
  }
  return {
    Mode: mode,
    Spec: spec
  };
}

function ls(path, pattern, callback) {
  path = path || '';
  pattern = pattern || '';
  $.get('/ls?path=' + path + '&pattern=' + pattern).then(function(data) {
    if (data.Status === 'OK') {
      callback(data, pattern);
    }
  });
}

function showError(title, errorMessage) {
  $('#error-message-title').html(title);
  $('#error-message').text(errorMessage);
  $('#error-message-dialog').modal('show');
}
