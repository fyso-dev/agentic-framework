"""Offline supervisor guard regression; no sockets, Dagu, or sandbox launch."""
import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).with_name('human-requests-sandbox-supervisor.py')
spec=importlib.util.spec_from_file_location('hr_supervisor',path)
supervisor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)

class OwnerGuardTest(unittest.TestCase):
    def test_foreign_listener_rejected_before_connection(self):
        connected=[]
        group=100;ports=[201,202,203,204,205]
        groups={100:100,101:100,999:999}
        def request_after_guard():
            ready=supervisor.verify_owners(101,group,ports[0],ports,100,lambda pid:groups[pid],lambda pid:100,
                                           lambda port:[101,999] if port==ports[0] else [])
            if ready:connected.append(True)
        with self.assertRaisesRegex(ValueError,'Unexpected listener'):
            request_after_guard()
        self.assertEqual(connected,[])
    def test_owned_listener_ready_and_absent_listener_not_ready(self):
        ports=[201,202,203,204,205]
        getpgid=lambda pid:100
        self.assertTrue(supervisor.verify_owners(101,100,201,ports,100,getpgid,lambda pid:100,lambda port:[101] if port==201 else []))
        self.assertFalse(supervisor.verify_owners(101,100,201,ports,100,getpgid,lambda pid:100,lambda port:[]))


class CleanupTest(unittest.TestCase):
    def test_timeout_or_early_exit_before_registration_cleans_group(self):
        for reason in ('timeout','test_exit_before_register'):
            members=[(101,100),(102,100)]; signals=[]
            def signal_group(group,signal):
                signals.append((group,signal));members.clear()
            supervisor.cleanup_group(100,999,lambda group:list(members),signal_group,lambda _:None)
            self.assertEqual(len(signals),1,reason)
            self.assertEqual(signals[0][0],100,reason)
    def test_never_signals_own_group_or_other_session(self):
        sent=[]
        with self.assertRaises(ValueError):
            supervisor.cleanup_group(100,100,lambda _:[],lambda *x:sent.append(x))
        with self.assertRaises(ValueError):
            supervisor.cleanup_group(100,999,lambda _:[(101,200)],lambda *x:sent.append(x))
        self.assertEqual(sent,[])
    def test_runner_registration_checks_parent_and_group(self):
        supervisor.verify_runner(101,100,100,lambda _:100,lambda _:100)
        with self.assertRaises(ValueError): supervisor.verify_runner(101,100,100,lambda _:100,lambda _:999)
        with self.assertRaises(ValueError): supervisor.verify_runner(101,100,100,lambda _:999,lambda _:100)

class SocketCollisionTest(unittest.TestCase):
    def test_predictable_name_and_collision_fail_closed(self):
        import tempfile
        from pathlib import Path
        self.assertEqual(supervisor.fixture_socket('generated-run').name,
                         '@dagu_ext-human-requests-request_98a3cc.sock')
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'socket'
            supervisor.require_unused_socket(path)
            path.symlink_to(Path(temp)/'missing')
            with self.assertRaises(FileExistsError): supervisor.require_unused_socket(path)
            self.assertTrue(path.is_symlink())

if __name__=='__main__':unittest.main()
