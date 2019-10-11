'use strict';

import * as $tea from "../";
import 'mocha';
import assert from 'assert';

describe('$tea', function () {
    it('cast should ok', async function () {
        let data = {
            items: [
                {
                    domain_id: 'sz16',
                    user_id: 'DING-EthqiPlOSS6giE',
                    avatar: '',
                    created_at: 1568773418121,
                    updated_at: 1568773418121,
                    email: '',
                    nick_name: '朴灵',
                    phone: '',
                    role: 'user',
                    status: 'enabled',
                    user_name: '朴灵',
                    description: '',
                    default_drive_id: ''
                },
                {
                    domain_id: 'sz16',
                    user_id: 'superadmin',
                    avatar: '',
                    created_at: 1568732914502,
                    updated_at: 0,
                    email: '',
                    nick_name: 'superadmin',
                    phone: '',
                    role: 'superadmin',
                    status: 'enabled',
                    user_name: 'superadmin',
                    description: '',
                    default_drive_id: ''
                }
            ],
            next_marker: 'next marker'
        };

        class BaseUserResponse extends $tea.Model {
            avatar?: string
            createdAt?: number
            defaultDriveId?: string
            description?: string
            domainId?: string
            email?: string
            nickName?: string
            phone?: string
            role?: string
            status?: string
            updatedAt?: number
            userId?: string
            userName?: string
            static names(): { [key: string]: string } {
                return {
                    avatar: 'avatar',
                    createdAt: 'created_at',
                    defaultDriveId: 'default_drive_id',
                    description: 'description',
                    domainId: 'domain_id',
                    email: 'email',
                    nickName: 'nick_name',
                    phone: 'phone',
                    role: 'role',
                    status: 'status',
                    updatedAt: 'updated_at',
                    userId: 'user_id',
                    userName: 'user_name',
                };
            }

            static types(): { [key: string]: any } {
                return {
                    avatar: 'string',
                    createdAt: 'number',
                    defaultDriveId: 'string',
                    description: 'string',
                    domainId: 'string',
                    email: 'string',
                    nickName: 'string',
                    phone: 'string',
                    role: 'string',
                    status: 'string',
                    updatedAt: 'number',
                    userId: 'string',
                    userName: 'string',
                };
            }

            constructor(map: { [key: string]: any }) {
                super(map);
            }
        }

        class ListUserResponse extends $tea.Model {
            items?: BaseUserResponse[]
            nextMarker?: string
            static names(): { [key: string]: string } {
                return {
                    items: 'items',
                    nextMarker: 'next_marker',
                };
            }

            static types(): { [key: string]: any } {
                return {
                    items: { 'type': 'array', 'itemType': BaseUserResponse },
                    nextMarker: 'string',
                };
            }

            constructor(map: { [key: string]: any }) {
                super(map);
            }
        }

        let response = $tea.cast(data, new ListUserResponse({}));

        assert.deepStrictEqual(response, new ListUserResponse({
            items: [
                new BaseUserResponse({
                    "avatar": "",
                    "createdAt": 1568773418121,
                    "defaultDriveId": "",
                    "description": "",
                    "domainId": "sz16",
                    "email": "",
                    "nickName": "朴灵",
                    "phone": "",
                    "role": "user",
                    "status": "enabled",
                    "updatedAt": 1568773418121,
                    "userId": "DING-EthqiPlOSS6giE",
                    "userName": "朴灵",
                }),
                new BaseUserResponse({
                    "avatar": "",
                    "createdAt": 1568732914502,
                    "defaultDriveId": "",
                    "description": "",
                    "domainId": "sz16",
                    "email": "",
                    "nickName": "superadmin",
                    "phone": "",
                    "role": "superadmin",
                    "status": "enabled",
                    "updatedAt": 0,
                    "userId": "superadmin",
                    "userName": "superadmin"
                })
            ],
            "nextMarker": "next marker"
        }));
    });
});
