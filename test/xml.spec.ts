import * as $dara from '../src/index';
import 'mocha';
import assert from 'assert';
import moment from 'moment';

describe('$dara xml', function () {

  const testXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<root>\n' +
    '  <Owner>\n' +
    '    <ID>1325847523475998</ID>\n' +
    '    <DisplayName>1325847523475998</DisplayName>\n' +
    '  </Owner>\n' +
    '  <AccessControlList>\n' +
    '    <Grant>public-read</Grant>\n' +
    '  </AccessControlList>\n' +
    '</root>';
  const errorXml = '<Error>\
    <Code>AccessForbidden</Code>\
    <Message>CORSResponse: CORS is not enabled for this bucket.</Message>\
    <RequestId>5DECB1F6F3150D373335D8D2</RequestId>\
    <HostId>sdk-oss-test.oss-cn-hangzhou.aliyuncs.com</HostId>\
  </Error>';

  it('parseXml should ok', async function () {
    class GetBucketAclResponseAccessControlPolicyAccessControlList extends $dara.Model {
      grant: string;
      static names(): { [key: string]: string } {
        return {
          grant: 'Grant',
        };
      }

      static types(): { [key: string]: any } {
        return {
          grant: 'string',
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }

    }

    class GetBucketAclResponseAccessControlPolicyOwner extends $dara.Model {
      iD: string;
      displayName: string;
      static names(): { [key: string]: string } {
        return {
          iD: 'ID',
          displayName: 'DisplayName',
        };
      }

      static types(): { [key: string]: any } {
        return {
          iD: 'string',
          displayName: 'string',
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }

    }

    class GetBucketAclResponseAccessControlPolicy extends $dara.Model {
      owner: GetBucketAclResponseAccessControlPolicyOwner;
      accessControlList: GetBucketAclResponseAccessControlPolicyAccessControlList;
      static names(): { [key: string]: string } {
        return {
          owner: 'Owner',
          accessControlList: 'AccessControlList',
        };
      }

      static types(): { [key: string]: any } {
        return {
          owner: GetBucketAclResponseAccessControlPolicyOwner,
          accessControlList: GetBucketAclResponseAccessControlPolicyAccessControlList,
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }

    }

    class GetBucketAclResponse extends $dara.Model {
      accessControlPolicy: GetBucketAclResponseAccessControlPolicy;
      static names(): { [key: string]: string } {
        return {
          accessControlPolicy: 'root',
        };
      }

      static types(): { [key: string]: any } {
        return {
          accessControlPolicy: GetBucketAclResponseAccessControlPolicy,
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }

    const data = {
      root: {
        Owner: { ID: '1325847523475998', DisplayName: '1325847523475998' },
        AccessControlList: { Grant: 'public-read' },
      },
    };
    assert.deepStrictEqual($dara.XML.parseXml(testXml, GetBucketAclResponse), data);
    assert.ok($dara.XML.parseXml(errorXml, GetBucketAclResponse));
    try {
      $dara.XML.parseXml('ddsfadf', GetBucketAclResponse)
    } catch (err) {
      assert.ok(err);
      return;
    }
    assert.ok(false);
  });

  it('parseXml with null should ok', async function () {

    const nullXml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '    <ListBucketResult xmlns="http://doc.oss-cn-hangzhou.aliyuncs.com">\n' +
      '        <Name>oss-example</Name>\n' +
      '        <Prefix></Prefix>\n' +
      '        <Marker></Marker>\n' +
      '        <MaxKeys>100</MaxKeys>\n' +
      '        <Delimiter></Delimiter>\n' +
      '        <IsTruncated>false</IsTruncated>\n' +
      '        <Contents>\n' +
      '            <Key>fun/movie/001.avi</Key>\n' +
      '            <LastModified>2012-02-24T08:43:07.000Z</LastModified>\n' +
      '            <ETag>5B3C1A2E053D763E1B002CC607C5A0FE1****</ETag>\n' +
      '            <Type>Normal</Type>\n' +
      '            <Size>344606</Size>\n' +
      '            <StorageClass>Standard</StorageClass>\n' +
      '            <Owner>\n' +
      '                <ID>0022012</ID>\n' +
      '                <DisplayName>user-example</DisplayName>\n' +
      '            </Owner>\n' +
      '        </Contents>\n' +
      '        <Contents>\n' +
      '            <Key>fun/movie/007.avi</Key>\n' +
      '            <LastModified>2012-02-24T08:43:07.000Z</LastModified>\n' +
      '            <ETag>5B3C1A2E053D763E1B002CC607C5A0FE2****</ETag>\n' +
      '            <Type>Normal</Type>\n' +
      '            <Size>144606</Size>\n' +
      '            <StorageClass>IA</StorageClass>\n' +
      '            <Owner>\n' +
      '                <ID>0022012</ID>\n' +
      '                <DisplayName>user-example</DisplayName>\n' +
      '            </Owner>\n' +
      '        </Contents>\n' +
      '        <Contents>\n' +
      '            <Key>oss.jpg</Key>\n' +
      '            <LastModified>2012-02-24T08:43:07.000Z</LastModified>\n' +
      '            <ETag>5B3C1A2E053D763E1B002CC607C5A0FE2****</ETag>\n' +
      '            <Type>Normal</Type>\n' +
      '            <Size>144606</Size>\n' +
      '            <StorageClass>IA</StorageClass>\n' +
      '            <Owner>\n' +
      '                <ID>0022012</ID>\n' +
      '                <DisplayName>user-example</DisplayName>\n' +
      '            </Owner>\n' +
      '        </Contents>\n' +
      '    </ListBucketResult>'

    const data = {
      ListBucketResult: {
        $: {
          xmlns: "http://doc.oss-cn-hangzhou.aliyuncs.com"
        },
        Name: "oss-example",
        Prefix: "",
        Marker: "",
        MaxKeys: "100",
        Delimiter: "",
        IsTruncated: "false",
        Contents: [
          {
            Key: "fun/movie/001.avi",
            LastModified: "2012-02-24T08:43:07.000Z",
            ETag: "5B3C1A2E053D763E1B002CC607C5A0FE1****",
            Type: "Normal",
            Size: "344606",
            StorageClass: "Standard",
            Owner: {
              ID: "0022012",
              DisplayName: "user-example"
            }
          },
          {
            Key: "fun/movie/007.avi",
            LastModified: "2012-02-24T08:43:07.000Z",
            ETag: "5B3C1A2E053D763E1B002CC607C5A0FE2****",
            Type: "Normal",
            Size: "144606",
            StorageClass: "IA",
            Owner: {
              ID: "0022012",
              DisplayName: "user-example"
            }
          },
          {
            Key: "oss.jpg",
            LastModified: "2012-02-24T08:43:07.000Z",
            ETag: "5B3C1A2E053D763E1B002CC607C5A0FE2****",
            Type: "Normal",
            Size: "144606",
            StorageClass: "IA",
            Owner: {
              ID: "0022012",
              DisplayName: "user-example"
            }
          }
        ]
      }
    };
    assert.deepStrictEqual($dara.XML.parseXml(nullXml, null), data);
    assert.ok($dara.XML.parseXml(errorXml, null));

    try {
      $dara.XML.parseXml('ddsfadf', null)
    } catch (err) {
      assert.ok(err);
      return;
    }
    assert.ok(false);
  });
  it('_toXML should ok', function () {
    const data = {
      root: {
        Owner: { ID: '1325847523475998', DisplayName: '1325847523475998' },
        AccessControlList: { Grant: 'public-read' },
      },
    };
    assert.strictEqual($dara.XML.toXML(data), testXml);
  });

  it('_xmlCast should ok', async function () {
    const data: { [key: string]: any } = {
      boolean: false,
      boolStr: 'true',
      number: 1,
      NaNNumber: null,
      NaN: undefined,
      string: 'string',
      array: ['string1', 'string2'],
      notArray: 'string',
      emptyArray: undefined,
      classArray: [{
        string: 'string',
      }, {
        string: 'string'
      }],
      classMap: '',
      map: {
        string: 'string',
      }
    };

    class TestSubModel extends $dara.Model {
      string: string;
      static names(): { [key: string]: string } {
        return {
          string: 'string',
        };
      }

      static types(): { [key: string]: any } {
        return {
          string: 'string',
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }

    class TestModel extends $dara.Model {
      boolean: boolean;
      boolStr: boolean;
      string: string;
      number: number;
      NaNNumber: number;
      array: string[];
      emptyArray: string[];
      notArray: string[];
      map: { [key: string]: any };
      classArray: TestSubModel[];
      classMap: TestSubModel;
      static names(): { [key: string]: string } {
        return {
          boolean: 'boolean',
          boolStr: 'boolStr',
          string: 'string',
          number: 'number',
          NaNNumber: 'NaNNumber',
          array: 'array',
          emptyArray: 'emptyArray',
          notArray: 'notArray',
          map: 'map',
          classArray: 'classArray',
          classMap: 'classMap',
        };
      }

      static types(): { [key: string]: any } {
        return {
          boolean: 'boolean',
          boolStr: 'boolean',
          string: 'string',
          number: 'number',
          NaNNumber: 'number',
          array: { type: 'array', itemType: 'string' },
          emptyArray: { type: 'array', itemType: 'string' },
          notArray: { type: 'array', itemType: 'string' },
          map: 'map',
          classArray: { type: 'array', itemType: TestSubModel },
          classMap: TestSubModel,
        };
      }

      constructor(map: { [key: string]: any }) {
        super(map);
      }
    }

    assert.deepStrictEqual($dara.XML._xmlCast(data, TestModel), {
      "boolean": false,
      "boolStr": true,
      "number": 1,
      "NaNNumber": NaN,
      "string": 'string',
      "array": ['string1', 'string2'],
      "classArray": [{
        "string": 'string',
      }, {
        "string": 'string'
      }],
      "notArray": ['string'],
      "emptyArray": [],
      "classMap": {
        "string": ''
      },
      "map": {
        "string": 'string',
      }
    });
  });
});