// Entry point of "Fyso Installer.app": runs the bundled bash script
// (Contents/Resources/fyso-installer.sh, sealed as a resource by the signature) with the
// same arguments and environment.
//
// A native Mach-O executable is what lets the app carry a Developer ID signature with
// the hardened runtime, which notarization and Gatekeeper require; a bash script as
// CFBundleExecutable cannot. Built by build.sh as a universal binary.
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    char exe[PATH_MAX], real[PATH_MAX], script[PATH_MAX];
    uint32_t size = sizeof exe;
    if (_NSGetExecutablePath(exe, &size) != 0 || realpath(exe, real) == NULL) {
        perror("fyso-installer: cannot locate the app bundle");
        return 1;
    }
    snprintf(script, sizeof script, "%s/../Resources/fyso-installer.sh", dirname(real));
    char **args = calloc((size_t)argc + 2, sizeof *args);
    if (args == NULL) return 1;
    args[0] = "/bin/bash";
    args[1] = script;
    for (int i = 1; i < argc; i++) args[i + 1] = argv[i];
    execv(args[0], args);
    perror("fyso-installer: cannot run /bin/bash");
    return 1;
}
