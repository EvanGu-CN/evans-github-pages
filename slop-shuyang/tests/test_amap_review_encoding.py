"""No API requests or real credentials: exercise Windows pipe decoding."""
import io,json,runpy,unittest
from pathlib import Path

read_credentials=runpy.run_path(str(Path(__file__).resolve().parents[1]/'tools/review-amap-landmarks.py'))['read_credentials']

class ReviewEncoding(unittest.TestCase):
    def test_utf8_json_is_not_decoded_as_the_windows_locale(self):
        data={'key':'a'*32,'securityCode':'b'*32,'queries':['沭阳巴黎新城','凤凰国际城北门']}
        raw=(json.dumps(data,ensure_ascii=False)+'\n').encode('utf8')
        stream=io.TextIOWrapper(io.BytesIO(raw),encoding='cp936',errors='surrogateescape')
        actual=read_credentials(stream)
        self.assertEqual(actual['queries'],data['queries'])
        for query in actual['queries']:query.encode('utf8',errors='strict')

    def test_invalid_surrogate_query_is_rejected_before_sdk_use(self):
        data={'key':'a'*32,'securityCode':'b'*32,'queries':['\udcad']}
        with self.assertRaises(UnicodeEncodeError):
            read_credentials(io.StringIO(json.dumps(data)+'\n'))

if __name__=='__main__':unittest.main()
