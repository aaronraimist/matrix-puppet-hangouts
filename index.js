const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const HangoutsClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:hangouts:index');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "hangouts";
  }
  defaultDeduplicationTag() {
    return " \u200b"; // Unicode Character 'ZERO WIDTH SPACE'
  }
  defaultDeduplicationTagPattern() {
    return "\\u200b$"; // Unicode Character 'ZERO WIDTH SPACE'
  }
  initThirdPartyClient() {
    this.threadInfo = {};
    this.userId = null;
    this.thirdPartyClient = new HangoutsClient();
    this.thirdPartyClient.connect();

    this.thirdPartyClient.on('message', (data)=> {
      if(data && data.type === 'message')
      {
        try {
          this.threadInfo[data.conversation_id] = {
            conversation_name: data.conversation_name,
          };
          debugVerbose("incoming message data:", data);
          const isMe = data.user_id.chat_id === data.self_user_id;
          const payload = {
            roomId: data.conversation_id,
            senderName: data.user,
            senderId: isMe ? undefined : data.user_id.chat_id,
            text: data.content,
          };
          return this.handleThirdPartyRoomMessage(payload).catch(err => {
            console.log("handleThirdPartyRoomMessage error", err);
          });
        } catch(er) {
          console.log("incoming message handling error:", er);
        }
      }

      // Message data format:
      /*{ user_id:
           { chat_id: '10xxxxxxxxxxxxxxxxxxx',
              gaia_id: '10xxxxxxxxxxxxxxxxxxx' },
            conversation_id: 'Ugxxxxxxxxxxxxxxxxxxxxxxxx',
            conversation_name: '+1nnnnnnnnnn',
            user: 'John Doe',
            content: 'a message!',
            type: 'message',
            status: 'success' }*/
    });

    return this.thirdPartyClient;
  }
  getThirdPartyRoomDataById(id) {
    let roomData = {
      name: this.threadInfo[id].conversation_name,
      topic: "Hangouts Chat"
    };
    return roomData;
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.thirdPartyClient.send(id, text);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("hangoutsbot");
      reg.addRegexPattern("users", "@hangouts_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();