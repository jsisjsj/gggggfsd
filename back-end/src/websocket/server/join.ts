import Server, { IServerModel } from '../../models/server.model';
import ChannelModel, { channelsToChannelListItems } from '../../models/channel.model';
import { ChannelList } from 'shared-interfaces/channel.interface';
import canJoinServer from '../auth/can-join-server';
import User from '../../models/user.model';
import * as mongoose from 'mongoose';
import { sendUserList } from './user-list/user-list';
import voiceChannelModel from '../../models/voice-channel.model';

export function joinServer(io: any) {
  io.on('connection', async socket => {
    socket.on('join-server', async serverId => {
      if (!mongoose.Types.ObjectId.isValid(serverId)) {
        socket.emit('soft-error', 'Invalid server ID');
        return;
      }

      const user = await User.findById(socket.claim.user_id).lean();
      if (!user) {
        socket.emit('soft-error', 'Unable to join.');
        return;
      }

      const server: IServerModel = <IServerModel>await Server.findById(serverId).lean();
      if (!server) {
        socket.emit('soft-error', 'The server you a trying to join does not exist.');
        return;
      }

      if (!(await canJoinServer(user, server._id))) {
        socket.emit('soft-error', 'You don\'t have permission to join this server.');
        return;
      }

      // Leave / Join appropriate socket rooms
      leaveOtherServers(socket);
      socket.join(`server-${server._id}`);

      // Send state
      const channelList = await getChannelList(server._id);
      socket.emit('channel-list', channelList);
      sendUserList(io, socket, server._id);
    });
  });
}

export async function getChannelList(serverId) {
  const channels: any = await ChannelModel.find(
    {
      server_id: serverId,
    },
    {
      _id: 1,
      name: 1,
      server_id: 1,
      last_message: 1,
    },
  ).lean();

  const channelsFormatted = channelsToChannelListItems(channels);
  const voiceChannels: any = await voiceChannelModel
    .find(
      {
        server_id: serverId,
      },
      {
        _id: 1,
        name: 1,
      },
    )
    .lean();

  const list: ChannelList = {
    server_id: serverId,
    channels: channelsFormatted,
    voiceChannels,
  };

  return list;
}

export async function leaveOtherServers(socket) {
  const roomsUserIsIn = Object.keys(socket.rooms);
  for (const room of roomsUserIsIn) {
    if (room.startsWith('server-') || room.startsWith('dmchannel-')) {
      // Leave any other servers user is in.
      await socket.leave(room);
    }
  }
}
