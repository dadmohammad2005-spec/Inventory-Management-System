"""
URL configuration for inventory_system project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('inventory.urls')),
    re_path(r'^(?:index\.html)?$', serve, {'document_root': str(settings.FRONTEND_DIR), 'path': 'index.html'}),
    re_path(r'^(?P<path>(css|js)/.*)$', serve, {'document_root': str(settings.FRONTEND_DIR)}),
]
