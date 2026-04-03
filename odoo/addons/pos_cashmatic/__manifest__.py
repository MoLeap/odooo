{
    'name': 'POS Cashmatic Cash Machines',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your POS with a cash matic automatic cash payment device',
    'depends': ['point_of_sale'],
    'installable': True,
    'data': [
        'views/pos_payment_method_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_cashmatic/static/src/**/*',
        ],
    },
    'author': 'Odoo S.A.',
    'license': 'LGPL-3',
}
