{
    'name': 'Mermaid Diagrams',
    'version': '19.0.1.0.0',
    'category': 'Productivity/Knowledge',
    'summary': 'Render Mermaid diagrams in code blocks',
    'author': 'K11E3R',
    'website': 'https://github.com/K11E3R/mermaid_diagram',
    'license': 'LGPL-3',
    'depends': ['html_editor'],
    'assets': {
        'html_editor.assets_editor': [
            'mermaid_diagram/static/src/**/*',
        ],
        'html_editor.assets_readonly': [
            'mermaid_diagram/static/src/mermaid_rendering/**/*',
        ],
    },
    'images': ['static/description/banner.jpeg'],
    'installable': True,
    'auto_install': False,
    'application': False,
}
