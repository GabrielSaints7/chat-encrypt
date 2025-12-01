/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get('conversations/:userId1/:userId2')
  async getConversation(
    @Param('userId1') userId1: string,
    @Param('userId2') userId2: string,
  ) {
    return await this.chatService.getConversation(userId1, userId2);
  }

  @Get('user/:userId/chats')
  async getUserChats(@Param('userId') userId: string) {
    return await this.chatService.getUserChats(userId);
  }

  @Post('group')
  async createGroup(@Body() data: CreateGroupDto) {
    return this.chatService.createGroup(data);
  }

  @Get('user/:userId/groups')
  async getUserGroups(@Param('userId') userId: string) {
    return this.chatService.getUserGroups(userId);
  }

  @Get('group/:groupId')
  async getGroup(@Param('groupId') groupId: string) {
    return this.chatService.getGroupById(groupId);
  }

  @Post('group/member')
  async addGroupMember(@Body() data: AddMemberDto) {
    return this.chatService.addGroupMember(data);
  }

  @Delete('group/:groupId/member/:userId')
  async removeGroupMember(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
    @Body('removedBy') removedBy: string,
  ) {
    return this.chatService.removeGroupMember(groupId, userId, removedBy);
  }

  @Delete('group/:groupId')
  async deleteGroup(
    @Param('groupId') groupId: string,
    @Body('userId') userId: string,
  ) {
    return this.chatService.deleteGroup(groupId, userId);
  }

  @Get('group/:groupId/messages')
  async getGroupMessages(
    @Param('groupId') groupId: string,
    @Query('userId') userId: string,
  ) {
    return this.chatService.getGroupMessages(groupId, userId);
  }

  @Get('group/:groupId/members')
  async getGroupMembers(@Param('groupId') groupId: string) {
    return this.chatService.getGroupMembers(groupId);
  }
}
