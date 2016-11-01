(function(global, $) {

  $(function() {
    global.editor.init();
  });

  global.editor = {
    editorLib: global.editorLib,
    currentDir: null,
    buffers: {},
    codemirror: null,
    changeReactionInterval: 550,
    changeReactionId: -1,

    init: function() {
      var _this = this;
      CodeMirror.modeURL = "/lib/codemirror/mode/%N/%N.js";
      CodeMirror.commands.save = _this.saveFile.bind(_this);
      CodeMirror.commands.autocomplete = _this.editorLib.autoComplete.bind(_this.editorLib);
      CodeMirror.commands.handleTab = _this.editorLib.handleTab.bind(_this.editorLib);
      _this.codemirror = CodeMirror.fromTextArea(document.getElementById("code"));
      $.get('/settings').done(function(data) {
        _this.editorLib.applySettings(_this.codemirror, data.Settings.CodeMirror);
      }).fail(function() {
        toastr.error('Error occured while loading the settings.');
      });

      $(window).resize(function() {
        _this.editorLib.resizeEditor(_this.codemirror);
      });
      _this.editorLib.resizeEditor(_this.codemirror);

      _this.codemirror.on('change', _this.editorLib.codeMirrorOnChange.bind(_this.editorLib));

      // Prompt if a user tries to close window without saving all filess
      window.onbeforeunload = function(e) {
        if (!_this.codemirror.getDoc().isClean(_this.codemirror.getDoc()
            .ChangeNumber)) {
          var ev = e || window.event;
          var errMsg = 'You have unsaved files.';
          // For IE and Firefox prior to version 4
          if (ev) {
            ev.returnValue = errMsg;
          }
          // For rest
          return errMsg;
        }
      };

      setInterval(function() {
        _this.editorLib.updateCursorPosition(_this.codemirror);
      }, 200);

      _this.editorLib.openEditor(_this.buffers, _this.codemirror);

      $('#file-path').on('input', function(e) {
        clearTimeout(_this.changeReactionId);
        _this.changeReactionId = setTimeout(function() {
          var input = $('#file-path').val();
          var fileNameDir = getFileNameDir(input);
          if (fileNameDir.FileDir) {
            ls(fileNameDir.FileDir, fileNameDir.FileName, _this.showFilesDirs.bind(_this));
          } else {
            $('#files-list').hide();
          }
        }, _this.changeReactionInterval);
      });

      $('#file-path').blur(function() {
        $('#files-list').hide();
        $('#file-path').val(_this.codemirror.getDoc().Path);
      });

      $('#file-path').focus(function() {
        $('#files-list').show();
        if (_this.codemirror.getDoc().Path) {
          _this.editorLib.selectFileName($('#file-path'));
        } else {
          $('#file-path').val(joinPath(_this.currentDir.Path, ''));
        }
      });

      _this.editorLib.navigateSetup($('#file-path'), $('#files-list'),
        function() {
          $('#files-list').hide();
          _this.codemirror.focus();
        },
        function(activeOne) {
          _this.enterAction(activeOne);
        });

      _this.editorLib.navigateSetup($('#buffer-path'), $('#buffers-list'),
        function() {
          $('#buffers-list').hide();
          $('#main').show();
          _this.codemirror.focus();
        },
        function(activeOne) {
          $('#buffers-list').hide();
          _this.editorLib.openEditor(_this.buffers, _this.codemirror,
            activeOne.data('file'));
        });

      $(document).keydown(function(e) {
        // Ctrl + .
        if (e.which === 190 && e.ctrlKey) {
          var input = $('#file-path').val();
          var fileNameDir = getFileNameDir(input);
          if (fileNameDir.FileDir) {
            ls(fileNameDir.FileDir, '', _this.updateFilesDirs.bind(_this));
          } else {
            ls('', '', _this.updateFilesDirs.bind(_this));
          }
          $('#buffers-list').hide();
          $('#main').show();
          $('#file-path').focus();
          e.preventDefault(); // prevent the default action (scroll / move caret)
        }
        // Ctrl + ,
        if (e.which === 188 && e.ctrlKey) {
          if (!$('#buffers-list').is(":visible")) {
            $('#main').hide();
            $('#buffers-list').show();
            $('#buffer-path').focus();
            var activeBufferPath = _this.codemirror.getDoc().Path;
            $('#buffers-list').html('');
            for (var k in _this.buffers) {
              var item = $('<a href="#" class="list-group-item">');
              if (_this.buffers[k].Path) {
                item.html(_this.buffers[k].Path);
              } else {
                item.html(_this.buffers[k].FileName);
              }
              if (_this.buffers[k].Path === activeBufferPath) {
                item.css('font-weight', 'bold');
              }
              item.on('click', function() {
                $('#buffers-list').hide();
                _this.editorLib.openEditor(_this.buffers, _this.codemirror, $(this).data('file'));
              });
              $('#buffers-list').append(item);
              item.data('file', _this.buffers[k]);
            }
          } else {
            $('#buffers-list').hide();
            $('#main').show();
            _this.codemirror.focus();
          }
          e.preventDefault(); // prevent the default action (scroll / move caret)
        }
      });
      ls('', '', _this.showFilesDirs.bind(_this));
      toastr.options.closeButton = true;
      toastr.options.timeOut = 30000;
      toastr.info('Press "Ctrl + ." to access the file browser.');
      toastr.info('Press "Ctrl + ," to access open buffers.');
    }, // init

    saveFile: function() {
      var _this = this;
      var currentDoc = _this.codemirror.getDoc();
      if (currentDoc.isClean(currentDoc.ChangeNumber) || currentDoc.Scratch) {
        return;
      }
      $.get('/fstat?path=' + currentDoc.Path).done(function(data) {
        if (data.Status === 'OK') {
          if (data.MTime !== currentDoc.MTime) {
            setTimeout(function() {
              var dialog = $('#file-modified-message-dialog');
              dialog.off('hidden.bs.modal');
              dialog.on('hidden.bs.modal', function() {
                _this.codemirror.focus();
              });
              dialog.off('show.bs.modal');
              dialog.on('show.bs.modal', function(e) {
                $(this).find('.btn-warning').off('click');
                $(this).find('.btn-danger').off('click');
                $(this).find('.btn-default').off('click');
                $(this).find('.btn-default').click(function() {
                  dialog.modal('hide');
                });
                $(this).find('.btn-warning').click(function() {
                  dialog.modal('hide');
                  delete _this.buffers[currentDoc.Path];
                  _this.editorLib.openEditor(_this.buffers,
                    _this.codemirror, currentDoc);
                });
                $(this).find('.btn-danger').click(function() {
                  dialog.modal('hide');
                  _this.editorLib.trySave(currentDoc,
                    true /*force*/ );
                });
              });
              dialog.modal('show');
            }, 100);
          } else {
            _this.editorLib.trySave(currentDoc);
          }
        } else {
          toastr.error(data.Message, 'Error');
        }
      }).fail(function() {
        toastr.error('Request failed.', 'Error');
      });
    },
    enterAction: function(item) {
      var _this = this;
      if (!item.data('file')) {
        return;
      }
      if (item.data('file').IsDirectory) {
        ls(item.data('file').Path, '', _this.showFilesDirs.bind(_this));
      } else {
        _this.editorLib.openEditor(_this.buffers, _this.codemirror, item.data('file'));
      }
    },
    showFilesDirs: function(data, pattern) {
      var _this = this;
      _this.updateFilesDirs(data, pattern);
      $('#file-path').trigger('focus');
      $('#file-path').val(joinPath(data.Path, pattern));
      $('#files-list').show();
    },
    updateFilesDirs: function(data, pattern) {
      var _this = this;
      _this.currentDir = data;
      $('#files-list').scrollTop(0);
      $('#files-list').html('');
      for (var i = 0; i < data.Files.length; ++i) {
        var item = $('<a href="#" class="list-group-item">');
        if (data.Files[i].IsDirectory) {
          item.html('<img src="/lib/folder.png" align="top"/> ' + data.Files[i].FileName);
        } else {
          if (_this.buffers[data.Files[i].Path]) {
            item.html('<img src="/lib/file.png" align="top"/> ' + data.Files[i].FileName + ' *');
          } else {
            item.html('<img src="/lib/file.png" align="top"/> ' + data.Files[i].FileName);
          }
        }
        item.data('file', data.Files[i]);
        $('#files-list').append(item);
      }
    },

  };
})(this, jQuery);
