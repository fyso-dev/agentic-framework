"""Offline checks; diagnostics must not expose arbitrary fixture log content."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

path=Path(__file__).with_name('test_human_requests_generated_dagu.py')
spec=importlib.util.spec_from_file_location('generated_dagu_diagnostic',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class DiagnosticTest(unittest.TestCase):
    def test_classifies_denied_command_without_disclosing_log(self):
        with tempfile.TemporaryDirectory() as temp:
            log=Path(temp)/'fixture.log'
            log.write_text('/secret/example.sh: line 6: mkdir: Operation not permitted\nsecret-value\n')
            self.assertEqual(module.sanitized_runner_diagnostic(log),'isolated runner failed invoking: mkdir')
    def test_failed_node_is_classified_only_from_fixture_stderr(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);log=root/'stderr';log.write_text('fixture-password /bin/mkdir: Operation not permitted')
            detail={'nodes':[{'step':{'id':'ask'},'statusLabel':'failed','stderr':str(log)}]}
            result=module.sanitized_run_failure(detail,root)
            self.assertIn('ask=failed',result);self.assertIn('mkdir',result)
            self.assertNotIn('fixture-password',result);self.assertNotIn(str(root),result)
    def test_run_error_text_redacts_fixture_credentials_urls_and_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);log=root/'run.log'
            log.write_text('ERROR exec /example/hidden/node failed: permission denied password=fixture-password\n')
            detail={'error':'failed to start /example/hidden/node', 'log':str(log), 'nodes':[]}
            result=module.sanitized_run_failure(detail,root)
            self.assertIn('permission denied',result);self.assertIn('failed to start',result)
            self.assertNotIn('/example/hidden',result);self.assertNotIn('fixture-password',result)
    def test_only_safe_fixture_socket_basename_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);log=root/'run.log'
            log.write_text('ERROR listen unix /tmp/@dagu_demo_123abc.sock: bind: operation not permitted')
            result=module.sanitized_run_failure({'log':str(log),'nodes':[]},root)
            self.assertIn('@dagu_demo_123abc.sock',result);self.assertNotIn('/tmp/',result)
    def test_watcher_path_only_reports_fixed_device_or_fixture_path(self):
        root=Path('/fixture')
        text='failed to start parent exit watcher: open /dev/null: operation not permitted'
        self.assertEqual(module.watcher_path_diagnostic(text,root),'/dev/null')
        text='failed to start parent exit watcher: open /fixture/data/watch: operation not permitted'
        self.assertEqual(module.watcher_path_diagnostic(text,root),'<fixture>/data/watch')
        text='failed to start parent exit watcher: open /private/user/secret: operation not permitted'
        self.assertEqual(module.watcher_path_diagnostic(text,root),'<outside-fixture-unidentified>')
    def test_unknown_permission_does_not_echo_log(self):
        with tempfile.TemporaryDirectory() as temp:
            log=Path(temp)/'fixture.log';log.write_text('secret-value: Permission denied')
            result=module.sanitized_runner_diagnostic(log)
            self.assertIn('unclassified',result);self.assertNotIn('secret-value',result)

if __name__=='__main__':unittest.main()
