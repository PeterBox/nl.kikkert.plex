'use strict'

var ChromecastAPI = require('chromecast-api')
var plexApp = Homey.app.api;
var devices = []
var self = {};
var installedPlayers = [];
var lastSession = null;


self.init = function(devices_data, callback) {
    console.log('Chromecast driver init', devices_data);plexApp.realtime('Chromecast driver init', devices_data);
    discoverChromecasts()
    installedPlayers = devices_data;
    
    Homey.manager('flow').on('action.playitemchrome.selected.autocomplete', function( callback, args ){
        callback( null, plexApp.searchAutoComplete(args.query) ); 
    });

    Homey.manager('flow').on('action.playitemchrome', function( callback, args ){
        plexApp.player({mediaItem: args.selected.mediaItem, command: 'playItem', devices: [args.device]})
        callback( null, true );
    });

    callback()
}


self.pair = function(socket) {
    socket.on('list_devices', function(data, callback) {
        callback(null, devices.map(function(chromecast) {
            return {
                name: chromecast.config.name,
                data: {
                    id: chromecast.config.name,
                    ip: chromecast.host,
                    type: 'chromecast',
                    name: chromecast.config.name
                }
            }
        }))
    })

    socket.on('add_device', function(device, callback){
        console.log('add_device', device);
        self.addInstalledDevice(device.data);
    })
}

self.addInstalledDevice = function(device){

    var currentDeviceId = device.id;
    var alreadyInstalled = false;

    installedPlayers.forEach(function(installed){
        if(installed.id == currentDeviceId){
            alreadyInstalled = true;
        }
    });

    if(!alreadyInstalled){
        installedPlayers.push(device);
    }
}

self.getInstalledPlayers = function(){
    return installedPlayers;
}

self.process = function(options, callback, stop){

    var mediaItem = options.mediaItem || null;
    var command = options.command || null;

    getDevice(options.devices[0].name, 

        function(device) {
             if(mediaItem && command == 'playItem'){
                device.play(buildPlexUrl(options), 0, function(){
                    lastSession = mediaItem;
                    Homey.manager('speech-output').say('Enjoy watching ' + mediaItem.title);
                })
             }

            if(command == "stop"){
                device.stop(function(){
                    console.log("Chromecast stopped playing");
                });
            }

            if(command == "pause"){
                device.pause();
            }
        }, 

        callback
    );

}

self.getLastSession = function(){
    return lastSession;
}

self.deleted = function(device_data, callback){
    console.log('deviceDeleted', device_data);

    for (var x in installedPlayers) {

        // If device found
        if (installedPlayers[x].id == device_data.id) {

            // Remove it from devices array
            var index = installedPlayers.indexOf(installedPlayers[x]);
            if (index > -1) {
                installedPlayers.splice(index, 1);
            }
        }
    }
    callback();
}

self.api = { // Api used to access driver methods from App.
    getInstalledPlayers: self.getInstalledPlayers,
    process: self.process,
    getLastSession: self.getLastSession
}

function buildPlexUrl(options){

    var url = "";
    url += "http://";
    url += options.server.hostname;
    url += ":" + options.server.port;
    url += "/video/:/transcode/universal/start?";
    url += "path=" + encodeURIComponent("http://" + options.server.hostname + ":" + options.server.port + options.mediaItem.key);
    url += "&mediaIndex=0&partIndex=0&protocol=http&offset=0&fastSeek=1&directPlay=0&directStream=1&subtitleSize=100&audioBoost=100&subtitles=burn&copyts=1&Accept-Language=en&X-Plex-Chunked=1&X-Plex-Product=Plex%20Web&X-Plex-Version=2.6.1&X-Plex-Client-Identifier=ChromeCastMike&X-Plex-Platform=Chrome&X-Plex-Platform-Version=50.0&X-Plex-Device=OSX&X-Plex-Device-Name=Plex%20Web%20%28Chrome%29";
    url += "&X-Plex-Token=" + options.serverToken; 

    console.log("buildPlexUrl", url);

    return url;
}

function discoverChromecasts(resetList) {
    var browser = new ChromecastAPI.Browser()
    browser.on('deviceOn', function(device) {
        if (resetList) {
            devices.length = 0
            resetList = false
        }
        devices.push(device)
        device.on('status', function(status) {
            Homey.manager('flow').trigger('chromecastStatusChanged', {
                status: status.playerState
            })
        })
    })
    setTimeout(function() {
        // rediscover devices
        discoverChromecasts(true)
    }, 600000) // 10 min
}

function getDevice(deviceName, success, error) {
    var device = devices.filter(function(device) {
        return device.config && device.config.name === deviceName
    })[0]
    if (device) {
        success(device)
    } else if (error) {
        error({"error": true, "message": "Sorry, I couldn't find Chromecast device "+ deviceName});
    }
}

module.exports.init = self.init;
module.exports.deleted = self.deleted;
module.exports.capabilities = {};
module.exports.pair = self.pair;
module.exports.api = self.api;
