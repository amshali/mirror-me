(function(global, $) {

  $(function() {
    global.editorLib.init();
  });

  global.editorLib = {
    init: function() {
    },
    onCleanBuffer: function() {
      $('#editor-cell').css("background-color", "grey");
    },

    onDirtyBuffer: function() {
      $('#editor-cell').css("background-color", "aqua");
    },

    codeMirrorOnChange: function(cm, changeObject) {
      var _this = this;
      if (cm.isClean(cm.getDoc().ChangeNumber)) {
        _this.onCleanBuffer();
      } else {
        _this.onDirtyBuffer();
      }
    },

    trySave: function(doc, force) {
      var _this = this;
      var request = {
        Path: doc.Path,
        Content: doc.getValue(),
        MTime: doc.MTime,
      };
      if (force) {
        request.MTime = null;
      }
      $.post("/save", request, function(resp) {
        if (resp.Status == 'OK') {
          $("#modified-bit").text("");
          doc.ChangeNumber = doc.changeGeneration(true);
          doc.MTime = resp.MTime;
          _this.onCleanBuffer();
        } else {
          setTimeout(function() {
            showError('Error saving file:', resp.Message);
          }, 100);
        }
      }).fail(function() {
        toastr.error('An error occured while trying to save the file.', 'Error');
        console.log('An error occured while trying to save the file.');
      });
    },

    autoComplete: function(cm) {
      cm.showHint({
        hint: CodeMirror.hint.anyword,
        completeSingle: false
      });
    },

    handleTab: function(cm) {
      if (cm.doc.somethingSelected()) {
        return CodeMirror.Pass;
      } else {
        if (cm.getOption('insertSoftTab') === true) {
          cm.execCommand('insertSoftTab');
        } else {
          return CodeMirror.Pass;
        }
      }
    },

    applySettings: function(cm, settings) {
      for (var k in settings) {
        cm.setOption(k, settings[k]);
      }
      cm.refresh();
    },

    updateCursorPosition: function(cm) {
      var doc = cm.getDoc();
      if (!doc) return;
      var cursorPos = doc.getCursor();
      $('#cursor-position').html((cursorPos.line + 1) + ':' + (cursorPos.ch + 1));
    },

    selectFileName: function(pathDisplay) {
      var input = pathDisplay.val();
      var lastSlash = input.lastIndexOf('/');
      pathDisplay.selectRange(lastSlash + 1, input.length);
    },

    focusFileItem: function(list, pathDisplay) {
      var _this = this;
      var items = list.find('a');
      var activeOne = list.find('a.active');
      var fileDir = activeOne.data('file');
      if (fileDir.FileDir) {
        pathDisplay.val(joinPath(fileDir.FileDir, fileDir.FileName));
      } else {
        pathDisplay.val(fileDir.FileName);
      }
      _this.selectFileName(pathDisplay);
      if (activeOne.index() - 4 >= 0) {
        list.scrollTop(list.scrollTop() - list.offset().top +
                       $(items[activeOne.index() - 4]).offset().top);
      } else {
        list.scrollTop(0);
      }
    },

    scrollTo: function(list, pathDisplay, offset) {
      var _this = this;
      var activeIndex = list.find('a.active').index();
      var listLen = list.find('a').length;
      var nextIndex = activeIndex + offset;
      if (nextIndex >= listLen) {
        if (activeIndex < listLen - 1) {
          nextIndex = listLen - 1;
        } else {
          nextIndex = 0;
        }
      } else if (nextIndex < 0) {
        if (activeIndex > 0) {
          nextIndex = 0;
        } else {
          nextIndex = listLen - 1;
        }
      }
      var n = list.find('a:eq(' + nextIndex + ')');
      list.find('a.active').toggleClass('active');
      n.toggleClass('active');
      _this.focusFileItem(list, pathDisplay);
    },

    navigateSetup: function(targetKeyItem, list, escapeCallback, enterCallback) {
      var _this = this;
      var PAGE_LEN = 7;
      targetKeyItem.keydown(function(e) {
        switch (e.which) {
          case 27:
            escapeCallback();
            break;
          case 33:
            _this.scrollTo(list, targetKeyItem, -PAGE_LEN);
            break;
          case 34:
            _this.scrollTo(list, targetKeyItem, +PAGE_LEN);
            break;
          case 13: // enter
            enterCallback(list.find('a.active'));
            break;
          case 38: // up
            _this.scrollTo(list, targetKeyItem, -1);
            break;
          case 40: // down
            _this.scrollTo(list, targetKeyItem, +1);
            break;
          default:
            return; // exit this handler for other keys
                       }
        e.preventDefault(); // prevent the default action (scroll / move caret)
      });
    },

    openFile: function(buffers, cm, fileData) {
      var _this = this;
      var SCRATCH_BUFFER_TITLE = '*scratch*';
      var doc = buffers[fileData.Path];
      if (!doc) {
        buffers[fileData.Path] = CodeMirror.Doc(fileData.FileContent);
        doc = buffers[fileData.Path];
        doc.Path = fileData.Path;
        doc.MTime = fileData.MTime;
        doc.ChangeNumber = 0;
        if (fileData.Path) {
          var fileDir = getFileNameDir(fileData.Path);
          doc.FileName = fileDir.FileName;
          doc.FileDir = fileDir.FileDir;
        } else {
          doc.FileName = SCRATCH_BUFFER_TITLE;
          doc.FileDir = '';
          doc.Scratch = true;
        }
        var item = $('<a href="#" class="list-group-item">');
        if (fileData.Path) {
          item.html(doc.Path);
        } else {
          item.html(doc.FileName);
        }
        $('#buffers-list').append(item);
        item.data('file', doc);
      }
      cm.swapDoc(doc);
      var mime = detectMode(doc.FileName);
      CodeMirror.autoLoadMode(cm, mime.Mode);
      cm.setOption('mode', mime.Spec);
      document.title = doc.FileName;
      $('#file-path').val(doc.Path);
      _this.codeMirrorOnChange(cm);
      cm.refresh();
      cm.focus();
    },

    openEditor: function(buffers, cm, fileData) {
      var _this = this;
      if (!fileData || !fileData.Path) {
        // scratch buffer
        $('#main').show();
        _this.openFile(buffers, cm, {Path: '', FileContent: ''});
      } else {
        if (buffers[fileData.Path]) {
          $('#main').show();
          _this.openFile(buffers, cm, fileData);
        } else {
          $.get('/cat?path=' + fileData.Path).then(function(data) {
            if (data.Status == 'OK') {
              $('#main').show();
              _this.openFile(buffers, cm, data);
            } else if (data.Status == 'ERROR') {
              setTimeout(function() {
                showError('Error opening file:', data.Message);
              }, 100);
            }
          });
        }
      }
    },
    resizeEditor: function(cm) {
      $("div.editor-row").height($(window).height() - $('div.status-div').outerHeight(true));
      var topBottomMargin = $("div.editor-area").outerHeight(true) -
          $("div.editor-area").innerHeight() + $('div.status-div').outerHeight(true);
      $("div.editor-area").height($(window).height() - topBottomMargin);
      cm.refresh();
    },
  };

})(this, jQuery);
